import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserRoles, requirePermission } from "../middleware/permissions.js";
import { getActiveCompanyId, resolveBusinessFeatureMap } from "../services/businessFeatures.service.js";
import { canManageAllBranches, resolveManagementScope } from "../services/managementScope.service.js";

const router = express.Router();
router.use(requireAuth);

router.use("/tills/:tillId", async (req, res, next) => {
  if (req.method !== "PATCH" || req.body?.cash_payment_account_id === undefined) return next();
  const open = await query("SELECT 1 FROM app.cashier_session WHERE till_id=$1 AND status IN ('OPEN','CLOSING') LIMIT 1", [req.params.tillId]);
  if (open.rowCount) return res.status(409).json({ success: false, message: "Close the active till session before changing the till cash account." });
  next();
});

router.use("/tills", async (req, res, next) => {
  if (req.method !== "POST" || !req.body?.cash_payment_account_id) return next();
  try {
    const valid = await query("SELECT 1 FROM fin.payment_account_control WHERE account_id=$1 AND channel_type='CASH' AND is_payment_account AND is_active", [req.body.cash_payment_account_id]);
    if (!valid.rowCount) return res.status(400).json({ success: false, message: "Till cash account must be an active CASH payment account." });
    next();
  } catch (error) { res.status(400).json({ success: false, message: "Failed to validate till cash account.", error: error.message }); }
});

// Phase 8D movement handler. It intentionally precedes the legacy foundation
// handler below so manual movements are validated, idempotent, and journaled.
router.post("/sessions/:sessionId/movements", async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const type = String(b.movement_type || "").toUpperCase();
    const amount = Number(b.amount);
    const reason = String(b.reason || "").trim();
    if (!["CASH_IN", "CASH_OUT", "SAFE_DROP", "PAYOUT"].includes(type)) return res.status(400).json({ success: false, message: "Unsupported till movement type." });
    if (!Number.isFinite(amount) || amount <= 0 || !reason) return res.status(400).json({ success: false, message: "A positive amount and reason are required." });
    const roles = getUserRoles(req);
    if (type === "SAFE_DROP" && !roles.some((r) => ["ADMIN", "MANAGER", "FINANCE"].includes(r))) return res.status(403).json({ success: false, message: "Safe drops require SAFE_DROP_TILL permission." });
    if (type !== "SAFE_DROP" && !roles.some((r) => ["ADMIN", "MANAGER", "FINANCE"].includes(r))) return res.status(403).json({ success: false, message: "Cash movements require CASH_IN_OUT permission." });
    await client.query("BEGIN");
    // Lock only the authoritative OPEN session row. PostgreSQL rejects FOR UPDATE
    // on the nullable side of the optional payment-account LEFT JOINs below.
    const lockedSession = await client.query("SELECT * FROM app.cashier_session WHERE session_id=$1 AND status='OPEN' FOR UPDATE", [req.params.sessionId]);
    if (!lockedSession.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Only an OPEN session accepts cash movements." }); }
    const session = await client.query("SELECT s.*,t.cash_payment_account_id,c.safe_cash_payment_account_id,tc.channel_type AS till_channel,tc.is_active AS till_account_active,tc.is_payment_account AS till_is_payment_account,sc.channel_type AS safe_channel,sc.is_active AS safe_account_active,sc.is_payment_account AS safe_is_payment_account FROM app.cashier_session s JOIN app.till t ON t.till_id=s.till_id JOIN app.till_configuration c ON c.company_id=s.company_id LEFT JOIN fin.payment_account_control tc ON tc.account_id=t.cash_payment_account_id LEFT JOIN fin.payment_account_control sc ON sc.account_id=c.safe_cash_payment_account_id WHERE s.session_id=$1", [req.params.sessionId]);
    const row = session.rows[0];
    if (manager(req)) {
      const scope = await resolveManagementScope(req, { branchId: req.query.management_branch_id || req.branchId, locationId: req.query.management_location_id || null, requireLocation: true });
      if (row.branch_id !== scope.branch.branch_id || row.location_id !== scope.location.location_id) { await client.query("ROLLBACK"); return res.status(403).json({ success: false, message: "You are not authorized for this session management target." }); }
    }
    if (!manager(req) && row.cashier_user_id !== req.user?.user_id) { await client.query("ROLLBACK"); return res.status(403).json({ success: false, message: "Cash movements are limited to your own session." }); }
    const requestBranch = req.branchId || req.headers["x-branch-id"] || req.body?.branch_id;
    if (!allBranches(req) && row.branch_id !== requestBranch) { await client.query("ROLLBACK"); return res.status(403).json({ success: false, message: "You are not authorized for this session branch." }); }
    if (b.idempotency_key) { const existing = await client.query("SELECT movement_id FROM app.till_cash_movement WHERE session_id=$1 AND idempotency_key=$2", [req.params.sessionId, String(b.idempotency_key)]); if (existing.rowCount) { await client.query("COMMIT"); return res.status(200).json({ success: true, idempotent: true, data: await sessionSummary(req.params.sessionId) }); } }
    const expected = await client.query("SELECT COALESCE(SUM(CASE WHEN movement_type IN ('OPENING_FLOAT','CASH_SALE','CASH_IN') THEN amount ELSE -amount END),0) AS expected FROM app.till_cash_movement WHERE session_id=$1", [req.params.sessionId]);
    if (["CASH_OUT", "SAFE_DROP", "PAYOUT"].includes(type) && amount > Number(expected.rows[0].expected)) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Movement exceeds the session's expected physical cash." }); }
    if (["SAFE_DROP", "CASH_IN"].includes(type) && (!row.cash_payment_account_id || !row.safe_cash_payment_account_id || row.till_channel !== "CASH" || row.safe_channel !== "CASH" || !row.till_account_active || !row.safe_account_active || !row.till_is_payment_account || !row.safe_is_payment_account)) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Configure both the till cash account and Safe/Main Cash as active CASH payment accounts before recording a cash transfer." }); }
    if (["SAFE_DROP", "CASH_IN"].includes(type) && row.cash_payment_account_id === row.safe_cash_payment_account_id) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Till Cash and Safe/Main Cash must use different GL accounts for cash transfers." }); }
    const sourceAccount = type === "SAFE_DROP" ? row.cash_payment_account_id : type === "CASH_IN" ? row.safe_cash_payment_account_id : null;
    const destinationAccount = type === "SAFE_DROP" ? row.safe_cash_payment_account_id : type === "CASH_IN" ? row.cash_payment_account_id : null;
    if (sourceAccount) {
      const sourceBalance = await client.query("SELECT current_balance,available_balance,allow_negative FROM fin.v_payment_account_balance WHERE account_id=$1", [sourceAccount]);
      const balance = sourceBalance.rows[0];
      if (balance && !balance.allow_negative && Number(balance.available_balance ?? balance.current_balance ?? 0) < amount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: `Insufficient available balance in the source cash account for ${type.replaceAll("_", " ")}.` });
      }
    }
    const inserted = await client.query(`INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reference,reason,idempotency_key,source_account_id,destination_account_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [row.company_id,row.branch_id,row.location_id,row.till_id,row.session_id,type,amount,b.reference||null,reason,b.idempotency_key||null,sourceAccount,destinationAccount,req.user?.user_id||null]);
    const movement = inserted.rows[0];
    if (["SAFE_DROP", "CASH_IN"].includes(type)) {
      const journal = await client.query("SELECT fin.create_journal('JV',CURRENT_DATE,$1::text,'TILL_CASH',$2::uuid) AS journal_id", [`${type} ${row.session_no} / ${movement.movement_id}`, movement.movement_id]);
      const journalId = journal.rows[0].journal_id;
      // The persisted session is authoritative for financial dimensions.
      // Keep this assignment for databases before the Phase 8H trigger.
      await client.query("UPDATE fin.gl_journal SET branch_id=$2 WHERE journal_id=$1 AND branch_id IS NULL", [journalId, row.branch_id]);
      await client.query("SELECT fin.add_journal_line($1::uuid,$2::uuid,NULL::uuid,$3::text,0,$4::numeric)",[journalId,sourceAccount,`${type} ${row.session_no}`,amount]);
      await client.query("SELECT fin.add_journal_line($1::uuid,$2::uuid,NULL::uuid,$3::text,$4::numeric,0)",[journalId,destinationAccount,`${type} ${row.session_no}`,amount]);
      await client.query("SELECT fin.assert_balanced($1::uuid)",[journalId]);
      await client.query("UPDATE app.till_cash_movement SET journal_id=$2 WHERE movement_id=$1",[movement.movement_id,journalId]);
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: await sessionSummary(req.params.sessionId) });
  } catch (error) { await client.query("ROLLBACK").catch(()=>{}); res.status(400).json({ success: false, message: "Failed to record cash movement.", error: error.message }); } finally { client.release(); }
});

router.use((req, _res, next) => {
  req.branchId = req.branchId || req.headers["x-branch-id"] || req.query.branch_id || req.body?.branch_id;
  req.locationId = req.locationId || req.headers["x-location-id"] || req.query.location_id || req.body?.location_id;
  next();
});

// Till cash accounts must always point at an active CASH payment account. Keep
// the current mapping on partial edits so changing a name/description cannot
// accidentally clear it.
router.use("/tills/:tillId", async (req, res, next) => {
  if (req.method !== "PATCH") return next();
  try {
    const current = await query("SELECT cash_payment_account_id FROM app.till WHERE till_id=$1", [req.params.tillId]);
    if (!current.rowCount) return next();
    if (req.body?.cash_payment_account_id === undefined) req.body.cash_payment_account_id = current.rows[0].cash_payment_account_id;
    if (req.body?.cash_payment_account_id !== null) {
      const valid = await query("SELECT 1 FROM fin.payment_account_control WHERE account_id=$1 AND channel_type='CASH' AND is_payment_account AND is_active", [req.body.cash_payment_account_id]);
      if (!valid.rowCount) return res.status(400).json({ success: false, message: "Till cash account must be an active CASH payment account." });
    }
    next();
  } catch (error) { res.status(400).json({ success: false, message: "Failed to validate till cash account.", error: error.message }); }
});

router.use("/sessions/:sessionId/movements", async (req, res, next) => {
  if (manager(req)) return next();
  const session = await query("SELECT cashier_user_id FROM app.cashier_session WHERE session_id=$1", [req.params.sessionId]);
  if (!session.rowCount || session.rows[0].cashier_user_id !== req.user?.user_id) return res.status(403).json({ success: false, message: "Cash movements are limited to your own session." });
  next();
});

const manager = (req) => getUserRoles(req).some((role) => ["ADMIN", "MANAGER", "HEAD_OFFICE"].includes(role));
const allBranches = (req) => canManageAllBranches(req);

async function resolveTillScope(req, tillId) {
  const companyId = await getActiveCompanyId();
  const till = await query("SELECT branch_id,location_id FROM app.till WHERE till_id=$1 AND company_id=$2", [tillId, companyId]);
  if (!till.rowCount) throw Object.assign(new Error("Till not found."), { statusCode: 404 });
  const scope = await resolveManagementScope(req, {
    branchId: req.query.management_branch_id || req.body?.branch_id || till.rows[0].branch_id,
    locationId: req.query.management_location_id || req.body?.location_id || till.rows[0].location_id,
    requireLocation: true
  });
  if (scope.branch.branch_id !== till.rows[0].branch_id || scope.location.location_id !== till.rows[0].location_id) {
    throw Object.assign(new Error("Till is outside the selected management branch/location."), { statusCode: 403 });
  }
  return { ...scope, till: till.rows[0] };
}

async function companyAndFeature() {
  const companyId = await getActiveCompanyId();
  const features = await resolveBusinessFeatureMap(companyId);
  return { companyId, enabled: Boolean(features.till_management) };
}

async function sessionSummary(sessionId) {
  const header = await query(`SELECT s.*, t.till_code, t.till_name, b.branch_name, l.location_name, u.full_name AS cashier_name, ou.full_name AS opened_by_name, cu.full_name AS closed_by_name,
    COALESCE((SELECT SUM(amount) FROM app.till_cash_movement WHERE session_id=s.session_id AND movement_type='OPENING_FLOAT'),0) AS opening_float_movement,
    COALESCE((SELECT SUM(amount) FROM app.till_cash_movement WHERE session_id=s.session_id AND movement_type='CASH_SALE'),0) AS cash_sales,
    COALESCE((SELECT SUM(amount) FROM app.till_cash_movement WHERE session_id=s.session_id AND movement_type='CASH_REFUND'),0) AS cash_refunds,
    COALESCE((SELECT SUM(amount) FROM app.till_cash_movement WHERE session_id=s.session_id AND movement_type='CASH_IN'),0) AS cash_in,
    COALESCE((SELECT SUM(amount) FROM app.till_cash_movement WHERE session_id=s.session_id AND movement_type='CASH_OUT'),0) AS cash_out,
    COALESCE((SELECT SUM(amount) FROM app.till_cash_movement WHERE session_id=s.session_id AND movement_type='SAFE_DROP'),0) AS safe_drops,
    COALESCE((SELECT SUM(amount) FROM app.till_cash_movement WHERE session_id=s.session_id AND movement_type='PAYOUT'),0) AS payouts,
    COALESCE((SELECT SUM(CASE WHEN movement_type IN ('OPENING_FLOAT','CASH_SALE','CASH_IN') THEN amount ELSE -amount END) FROM app.till_cash_movement WHERE session_id=s.session_id),0) AS expected_cash
    FROM app.cashier_session s JOIN app.till t ON t.till_id=s.till_id JOIN app.branch b ON b.branch_id=s.branch_id JOIN app.location l ON l.location_id=s.location_id JOIN sec.app_user u ON u.user_id=s.cashier_user_id LEFT JOIN sec.app_user ou ON ou.user_id=s.opened_by LEFT JOIN sec.app_user cu ON cu.user_id=s.closed_by WHERE s.session_id=$1`, [sessionId]);
  if (!header.rowCount) return null;
  const payments = await query(`SELECT ps.payment_method, COALESCE(pc.channel_name, ps.payment_method) AS payment_channel, COUNT(*)::int AS transaction_count, COALESCE(SUM(ps.total_amount),0) AS total_amount
    FROM sal.pos_sale ps LEFT JOIN app.payment_transaction pt ON pt.document_type='POS_SALE' AND pt.document_id=ps.pos_sale_id LEFT JOIN fin.api_payment_channel pc ON pc.api_payment_channel_id=pt.channel_id
    WHERE ps.session_id=$1 AND ps.status='POSTED' GROUP BY ps.payment_method,COALESCE(pc.channel_name,ps.payment_method) ORDER BY ps.payment_method,payment_channel`, [sessionId]);
  const activity = await query(`SELECT 'CASH_MOVEMENT' AS activity_type,m.movement_type AS action,m.amount,m.reference,m.reason,m.created_by,m.created_at AS activity_created_at,cu.full_name AS created_by_name,COALESCE(m.journal_id,(SELECT ps.posted_journal_id FROM sal.pos_sale ps WHERE m.source_document_type='POS_SALE' AND ps.pos_sale_id=m.source_document_id)) AS journal_id FROM app.till_cash_movement m LEFT JOIN sec.app_user cu ON cu.user_id=m.created_by WHERE m.session_id=$1 UNION ALL SELECT 'POS_SALE','POS_SALE',ps.total_amount,NULL,ps.sale_no,ps.created_by,ps.created_at AS activity_created_at,pu.full_name,ps.posted_journal_id FROM sal.pos_sale ps LEFT JOIN sec.app_user pu ON pu.user_id=ps.created_by WHERE ps.session_id=$1 UNION ALL SELECT 'SESSION_EVENT','SESSION_CLOSE',0,NULL,s.closing_notes,s.closed_by,s.closed_at,cu.full_name,NULL FROM app.cashier_session s LEFT JOIN sec.app_user cu ON cu.user_id=s.closed_by WHERE s.session_id=$1 AND s.closed_at IS NOT NULL ORDER BY activity_created_at`, [sessionId]);
  const handover = await query(`SELECT h.*,su.full_name AS source_cashier_name,ru.full_name AS receiving_cashier_name FROM app.till_cash_handover h JOIN sec.app_user su ON su.user_id=h.source_cashier_user_id LEFT JOIN sec.app_user ru ON ru.user_id=h.receiving_cashier_user_id WHERE h.source_session_id=$1 OR h.receiving_session_id=$1 ORDER BY h.created_at DESC LIMIT 20`, [sessionId]);
  return { ...header.rows[0], payments: payments.rows, activity: activity.rows, handovers: handover.rows };
}

async function cashAccountsFor(client, companyId, tillId) {
  return client.query(`SELECT t.cash_payment_account_id, c.safe_cash_payment_account_id,
    tc.channel_type AS till_channel, tc.is_active AS till_active, tc.is_payment_account AS till_is_payment,
    sc.channel_type AS safe_channel, sc.is_active AS safe_active, sc.is_payment_account AS safe_is_payment
    FROM app.till t JOIN app.till_configuration c ON c.company_id=t.company_id
    LEFT JOIN fin.payment_account_control tc ON tc.account_id=t.cash_payment_account_id
    LEFT JOIN fin.payment_account_control sc ON sc.account_id=c.safe_cash_payment_account_id
    WHERE t.company_id=$1 AND t.till_id=$2`, [companyId, tillId]);
}

async function assertSourceBalance(client, accountId, amount) {
  const balance = await client.query("SELECT current_balance,available_balance,allow_negative FROM fin.v_payment_account_balance WHERE account_id=$1", [accountId]);
  const row = balance.rows[0];
  if (!row) throw Object.assign(new Error("Source cash account balance is unavailable."), { statusCode: 409 });
  if (!row.allow_negative && Number(row.available_balance ?? row.current_balance ?? 0) < amount) throw Object.assign(new Error("Main Cash Safe has insufficient available cash for the requested opening float."), { statusCode: 409 });
}

async function createCashTransferJournal(client, type, session, movementId, sourceAccount, destinationAccount, amount) {
  const journal = await client.query("SELECT fin.create_journal('JV',CURRENT_DATE,$1::text,'TILL_CASH',$2::uuid) AS journal_id", [`${type} ${session.session_no} / ${movementId}`, movementId]);
  const journalId = journal.rows[0].journal_id;
  await client.query("UPDATE fin.gl_journal SET branch_id=$2 WHERE journal_id=$1 AND branch_id IS NULL", [journalId, session.branch_id]);
  await client.query("SELECT fin.add_journal_line($1::uuid,$2::uuid,NULL::uuid,$3::text,0,$4::numeric)", [journalId, sourceAccount, `${type} ${session.session_no}`, amount]);
  await client.query("SELECT fin.add_journal_line($1::uuid,$2::uuid,NULL::uuid,$3::text,$4::numeric,0)", [journalId, destinationAccount, `${type} ${session.session_no}`, amount]);
  await client.query("SELECT fin.assert_balanced($1::uuid)", [journalId]);
  await client.query("UPDATE app.till_cash_movement SET journal_id=$2 WHERE movement_id=$1", [movementId, journalId]);
  return journalId;
}

router.get("/opening-options", requirePermission("VIEW_TILLS"), async (req, res) => {
  try {
    const tillId = req.query.till_id;
    const scope = await resolveTillScope(req, tillId);
    const accounts = await query(`SELECT t.till_id,t.till_code,t.till_name,t.cash_payment_account_id,c.safe_cash_payment_account_id,
      pa.account_code AS till_account_code,sa.account_code AS safe_account_code,
      COALESCE(pb.available_balance,0) AS safe_available_balance,
      EXISTS (SELECT 1 FROM app.cashier_session cs WHERE cs.till_id=t.till_id AND cs.status IN ('CLOSED','RECONCILED') AND cs.cash_disposition='CARRY_FORWARD' AND COALESCE(cs.handover_amount,0)>0) AS has_carry_forward
      FROM app.till t JOIN app.till_configuration c ON c.company_id=t.company_id
      LEFT JOIN fin.gl_account pa ON pa.account_id=t.cash_payment_account_id
      LEFT JOIN fin.gl_account sa ON sa.account_id=c.safe_cash_payment_account_id
      LEFT JOIN fin.v_payment_account_balance pb ON pb.account_id=c.safe_cash_payment_account_id
      WHERE t.company_id=$1 AND t.till_id=$2 AND t.branch_id=$3 AND t.location_id=$4`, [scope.companyId, tillId, scope.branch.branch_id, scope.location.location_id]);
    if (!accounts.rowCount) return res.status(404).json({ success: false, message: "Till not found." });
    const previous = await query(`SELECT session_id,session_no,closed_at,cashier_user_id,handover_amount FROM app.cashier_session WHERE till_id=$1 AND status IN ('CLOSED','RECONCILED') AND cash_disposition='CARRY_FORWARD' AND COALESCE(handover_amount,0)>0 ORDER BY closed_at DESC LIMIT 10`, [tillId]);
    res.json({ success: true, data: { ...accounts.rows[0], carry_forward_sessions: previous.rows } });
  } catch (error) { res.status(400).json({ success: false, message: "Failed to load opening options.", error: error.message }); }
});

// Phase 8F opening handler. It precedes the legacy handlers below.
router.post("/sessions/open", requirePermission("OPEN_TILL_SESSION"), async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {}, source = String(b.opening_source || "EXISTING_TILL_BALANCE").toUpperCase();
    const amount = Number(b.opening_float || 0), branchId = String(b.branch_id || req.branchId || ""), locationId = String(b.location_id || req.locationId || ""), cashierId = b.cashier_user_id || req.user?.user_id;
    if (!["MAIN_SAFE", "CARRY_FORWARD", "EXISTING_TILL_BALANCE"].includes(source) || !Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: "Opening source and non-negative opening float are required." });
    const companyId = await getActiveCompanyId();
    if (!(await companyAndFeature()).enabled) return res.status(409).json({ success: false, message: "Till Management is disabled." });
    await client.query("BEGIN");
    const till = await client.query("SELECT * FROM app.till WHERE till_id=$1 AND company_id=$2 AND branch_id=$3 AND location_id=$4 AND is_active FOR UPDATE", [b.till_id, companyId, branchId, locationId]);
    if (!till.rowCount) throw Object.assign(new Error("Till is inactive or outside the selected branch/location."), { statusCode: 403 });
    const access = await client.query(`SELECT ut.can_open FROM sec.user_till ut WHERE ut.user_id=$1 AND ut.till_id=$2 AND ut.is_active`, [cashierId, b.till_id]);
    if (!manager(req) && (!access.rowCount || !access.rows[0].can_open)) throw Object.assign(new Error("Cashier is not authorized to open this till."), { statusCode: 403 });
    if (cashierId !== req.user?.user_id && !manager(req)) throw Object.assign(new Error("Only an authorized manager may open a session for another cashier."), { statusCode: 403 });
    if ((await client.query("SELECT 1 FROM app.cashier_session WHERE cashier_user_id=$1 AND status IN ('OPEN','CLOSING')", [cashierId])).rowCount || (await client.query("SELECT 1 FROM app.cashier_session WHERE till_id=$1 AND status IN ('OPEN','CLOSING')", [b.till_id])).rowCount) throw Object.assign(new Error("An active session already exists for this cashier or till."), { statusCode: 409 });
    const accountRows = await cashAccountsFor(client, companyId, b.till_id), accounts = accountRows.rows[0];
    let resolvedAmount = amount, sourceSessionId = b.opening_source_session_id || null;
    if (source === "MAIN_SAFE") {
      if (!accounts?.cash_payment_account_id || !accounts?.safe_cash_payment_account_id || accounts.till_channel !== "CASH" || accounts.safe_channel !== "CASH" || !accounts.till_active || !accounts.safe_active || accounts.cash_payment_account_id === accounts.safe_cash_payment_account_id) throw Object.assign(new Error("Configure two active, different CASH accounts before opening from Main Safe."), { statusCode: 409 });
      if (resolvedAmount <= 0) throw Object.assign(new Error("Main Safe opening float must be positive."), { statusCode: 400 });
      await assertSourceBalance(client, accounts.safe_cash_payment_account_id, resolvedAmount);
    } else if (source === "CARRY_FORWARD") {
      const prior = await client.query("SELECT * FROM app.cashier_session WHERE session_id=$1 AND till_id=$2 AND status IN ('CLOSED','RECONCILED') AND cash_disposition='CARRY_FORWARD' FOR UPDATE", [sourceSessionId, b.till_id]);
      if (!prior.rowCount || Number(prior.rows[0].handover_amount || 0) <= 0) throw Object.assign(new Error("Select an approved carry-forward from a closed session on the same till."), { statusCode: 409 });
      resolvedAmount = Number(prior.rows[0].handover_amount);
    }
    const inserted = await client.query(`INSERT INTO app.cashier_session(company_id,branch_id,location_id,till_id,cashier_user_id,opening_float,opening_source,opening_source_session_id,opening_notes,opened_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [companyId, branchId, locationId, b.till_id, cashierId, resolvedAmount, source, sourceSessionId, b.opening_notes || null, req.user?.user_id || null]);
    const session = inserted.rows[0];
    if (resolvedAmount > 0) {
      const movement = await client.query(`INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reason,source_document_type,source_document_id,created_by) VALUES($1,$2,$3,$4,$5,'OPENING_FLOAT',$6,$7,$8,$9,$10) RETURNING movement_id`, [companyId, branchId, locationId, b.till_id, session.session_id, resolvedAmount, source === "CARRY_FORWARD" ? "Carry-forward opening float" : "Opening float", source, sourceSessionId, req.user?.user_id || null]);
      if (source === "MAIN_SAFE") { const journalId = await createCashTransferJournal(client, "OPENING_FLOAT", session, movement.rows[0].movement_id, accounts.safe_cash_payment_account_id, accounts.cash_payment_account_id, resolvedAmount); await client.query("UPDATE app.cashier_session SET opening_transfer_journal_id=$2 WHERE session_id=$1", [session.session_id, journalId]); }
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: await sessionSummary(session.session_id) });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(error.statusCode || 400).json({ success: false, message: error.message || "Failed to open till session.", error: error.message }); } finally { client.release(); }
});

router.get("/config", requirePermission("VIEW_TILLS"), async (req, res) => {
  try { const c = await getActiveCompanyId(); const r = await query("SELECT * FROM app.till_configuration WHERE company_id=$1", [c]); res.json({ success: true, data: r.rows[0] || null }); }
  catch (error) { res.status(500).json({ success: false, message: "Failed to load till configuration.", error: error.message }); }
});

router.patch("/config", requirePermission("MANAGE_TILLS"), async (req, res) => {
  try { const c = await getActiveCompanyId(); const b=req.body||{}; const account=b.safe_cash_payment_account_id||null; if(account){const valid=await query("SELECT 1 FROM fin.payment_account_control WHERE account_id=$1 AND channel_type='CASH' AND is_payment_account AND is_active",[account]);if(!valid.rowCount)return res.status(400).json({success:false,message:"Safe/Main Cash Account must be an active CASH payment account."});} const r=await query(`UPDATE app.till_configuration SET cash_variance_tolerance=COALESCE($2,cash_variance_tolerance),require_variance_approval=COALESCE($3,require_variance_approval),one_session_per_cashier=COALESCE($4,one_session_per_cashier),max_session_hours=$5,safe_cash_payment_account_id=COALESCE($6,safe_cash_payment_account_id),updated_at=now(),updated_by=$7 WHERE company_id=$1 RETURNING *`,[c,b.cash_variance_tolerance===undefined?null:Number(b.cash_variance_tolerance),b.require_variance_approval===undefined?null:Boolean(b.require_variance_approval),b.one_session_per_cashier===undefined?null:Boolean(b.one_session_per_cashier),b.max_session_hours??null,account,req.user?.user_id||null]); res.json({success:true,data:r.rows[0]}); }
  catch(error){res.status(400).json({success:false,message:"Failed to update till configuration.",error:error.message});}
});

router.get("/tills", requirePermission("VIEW_TILLS"), async (req, res) => {
  try { const scope=await resolveManagementScope(req,{branchId:req.query.management_branch_id||req.branchId,locationId:req.query.management_location_id||null}); const r=await query(`SELECT t.*,b.branch_name,l.location_name,pa.account_code AS cash_account_code,open_s.session_id,open_s.session_no,open_s.cashier_user_id,cu.full_name AS cashier_name FROM app.till t JOIN app.branch b ON b.branch_id=t.branch_id JOIN app.location l ON l.location_id=t.location_id LEFT JOIN fin.gl_account pa ON pa.account_id=t.cash_payment_account_id LEFT JOIN app.cashier_session open_s ON open_s.till_id=t.till_id AND open_s.status IN ('OPEN','CLOSING') LEFT JOIN sec.app_user cu ON cu.user_id=open_s.cashier_user_id WHERE t.company_id=$1 AND t.branch_id=$2 AND ($3::uuid IS NULL OR t.location_id=$3) ORDER BY b.branch_name,l.location_name,t.till_code`,[scope.companyId,scope.branch.branch_id,req.query.management_location_id||null]); res.json({success:true,count:r.rowCount,data:r.rows}); }
  catch(error){res.status(500).json({success:false,message:"Failed to load tills.",error:error.message});}
});

router.get("/tills/:tillId/assignments", requirePermission("VIEW_TILLS"), async (req,res)=>{try{const scope=await resolveTillScope(req,req.params.tillId);const r=await query(`SELECT ut.user_till_id,ut.user_id,ut.till_id,ut.can_open,ut.can_close,ut.can_reconcile,ut.is_active,u.full_name,u.username,COALESCE(string_agg(DISTINCT ur.role_code,', ' ORDER BY ur.role_code),'') AS roles FROM sec.user_till ut JOIN app.till t ON t.till_id=ut.till_id AND t.company_id=$2 AND t.branch_id=$3 AND t.location_id=$4 JOIN sec.app_user u ON u.user_id=ut.user_id LEFT JOIN sec.user_role ur ON ur.user_id=u.user_id WHERE ut.till_id=$1 GROUP BY ut.user_till_id,u.full_name,u.username`,[req.params.tillId,scope.companyId,scope.branch.branch_id,scope.location.location_id]);res.json({success:true,data:r.rows});}catch(error){res.status(error.statusCode||500).json({success:false,message:error.message||"Failed to load till assignments."});}});

router.get("/till-assignment-summary", requirePermission("VIEW_TILLS"), async (req,res)=>{try{const c=await getActiveCompanyId();const r=await query(`SELECT ut.till_id,COUNT(*)::int AS assigned_count,COALESCE(string_agg(u.full_name,', ' ORDER BY u.full_name),'') AS assigned_users FROM sec.user_till ut JOIN app.till t ON t.till_id=ut.till_id AND t.company_id=$1 JOIN sec.app_user u ON u.user_id=ut.user_id WHERE ut.is_active AND u.is_active GROUP BY ut.till_id`,[c]);res.json({success:true,data:r.rows});}catch(error){res.status(500).json({success:false,message:"Failed to load till assignment summary.",error:error.message});}});

router.get("/my-tills", requirePermission("VIEW_TILLS"), async (req,res)=>{try{const c=await getActiveCompanyId();const locationId=req.query.location_id||req.headers["x-location-id"];const r=await query(`SELECT t.*,b.branch_name,l.location_name,ga.account_code AS cash_account_code,ut.can_open,ut.can_close,ut.can_reconcile,open_s.session_id,open_s.session_no FROM app.till t JOIN app.branch b ON b.branch_id=t.branch_id JOIN app.location l ON l.location_id=t.location_id JOIN sec.user_till ut ON ut.till_id=t.till_id AND ut.user_id=$4 AND ut.is_active LEFT JOIN fin.gl_account ga ON ga.account_id=t.cash_payment_account_id LEFT JOIN app.cashier_session open_s ON open_s.till_id=t.till_id AND open_s.cashier_user_id=$4 AND open_s.status IN ('OPEN','CLOSING') WHERE t.company_id=$1 AND t.branch_id=$2 AND t.location_id=$3 AND t.is_active ORDER BY t.till_code`,[c,req.branchId,locationId,req.user?.user_id]);res.json({success:true,data:r.rows});}catch(error){res.status(400).json({success:false,message:"Failed to load your eligible tills.",error:error.message});}});

router.get("/eligible-users", requirePermission("VIEW_TILLS"), async (req,res)=>{try{const tillId=req.query.till_id;if(!tillId)return res.status(400).json({success:false,message:"till_id is required."});const scope=await resolveTillScope(req,tillId);const requireAssignment=String(req.query.require_assignment||"").toLowerCase()==="true";const r=await query(`SELECT DISTINCT u.user_id,u.full_name,u.username,COALESCE(string_agg(DISTINCT ur.role_code,', ' ORDER BY ur.role_code),'') AS roles,COALESCE(bool_or(ut.can_open),false) AS can_open FROM app.till t JOIN app.location l ON l.location_id=t.location_id AND l.branch_id=t.branch_id AND l.company_id=t.company_id AND l.is_active JOIN sec.app_user u ON u.is_active JOIN sec.user_branch ub ON ub.user_id=u.user_id AND ub.branch_id=t.branch_id AND ub.is_active JOIN sec.user_location ul ON ul.user_id=u.user_id AND ul.location_id=t.location_id AND ul.is_active JOIN sec.user_role ur ON ur.user_id=u.user_id AND ur.role_code IN ('ADMIN','MANAGER','SALES','FINANCE') LEFT JOIN sec.user_till ut ON ut.user_id=u.user_id AND ut.till_id=t.till_id AND ut.is_active WHERE t.till_id=$2 AND t.company_id=$1 AND t.branch_id=$3 AND t.location_id=$4 AND t.is_active AND ($5::boolean=false OR COALESCE(ut.can_open,false)) GROUP BY u.user_id,u.full_name,u.username ORDER BY u.full_name`,[scope.companyId,tillId,scope.branch.branch_id,scope.location.location_id,requireAssignment]);res.json({success:true,data:r.rows});}catch(error){res.status(error.statusCode||400).json({success:false,message:error.message||"Failed to load eligible till users."});}});

router.post("/tills/:tillId/assignments", requirePermission("ASSIGN_TILL_USERS"), async (req,res)=>{try{const b=req.body||{};const scope=await resolveTillScope(req,req.params.tillId);if(!b.user_id)return res.status(400).json({success:false,message:"user_id is required."});const valid=await query(`SELECT 1 FROM app.till t JOIN sec.app_user u ON u.user_id=$2 JOIN sec.user_branch ub ON ub.user_id=u.user_id AND ub.branch_id=t.branch_id AND ub.is_active JOIN sec.user_location ul ON ul.user_id=u.user_id AND ul.location_id=t.location_id AND ul.is_active WHERE t.till_id=$1 AND t.company_id=$3 AND t.branch_id=$4 AND t.location_id=$5 AND u.is_active`,[req.params.tillId,b.user_id,scope.companyId,scope.branch.branch_id,scope.location.location_id]);if(!valid.rowCount)return res.status(400).json({success:false,message:"User is inactive or not authorized for this till branch/location."});const r=await query(`INSERT INTO sec.user_till(user_id,till_id,can_open,can_close,can_reconcile,is_active,updated_at) VALUES($1,$2,COALESCE($3,true),COALESCE($4,true),COALESCE($5,false),COALESCE($6,true),now()) ON CONFLICT(user_id,till_id) DO UPDATE SET can_open=EXCLUDED.can_open,can_close=EXCLUDED.can_close,can_reconcile=EXCLUDED.can_reconcile,is_active=EXCLUDED.is_active,updated_at=now() RETURNING *`,[b.user_id,req.params.tillId,b.can_open,b.can_close,b.can_reconcile,b.is_active]);res.status(201).json({success:true,data:r.rows[0]});}catch(error){res.status(error.statusCode||400).json({success:false,message:error.message||"Failed to assign till user."});}});

router.post("/tills", requirePermission("MANAGE_TILLS"), async (req,res)=>{try{const c=await getActiveCompanyId();const b=req.body||{};if(!b.branch_id||!b.location_id||!b.till_code||!b.till_name)return res.status(400).json({success:false,message:"branch_id, location_id, till_code, and till_name are required."});const scope=await resolveManagementScope(req,{branchId:b.branch_id,locationId:b.location_id,requireLocation:true});const r=await query(`INSERT INTO app.till(company_id,branch_id,location_id,till_code,till_name,description,cash_payment_account_id,cash_gl_account_id,allow_shared_session,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,[scope.companyId,b.branch_id,b.location_id,String(b.till_code).trim().toUpperCase(),b.till_name,b.description||null,b.cash_payment_account_id||null,b.cash_gl_account_id||null,Boolean(b.allow_shared_session),req.user?.user_id||null]);res.status(201).json({success:true,data:r.rows[0]});}catch(error){res.status(error.statusCode|| (error.code==='23505'?409:400)).json({success:false,message:error.statusCode?error.message:error.code==='23505'?"Till code already exists at this location.":"Failed to create till.",error:error.message});}});

router.patch("/tills/:tillId", requirePermission("MANAGE_TILLS"), async(req,res)=>{try{const b=req.body||{};if(b.is_active===false){const open=await query("SELECT 1 FROM app.cashier_session WHERE till_id=$1 AND status IN ('OPEN','CLOSING') LIMIT 1",[req.params.tillId]);if(open.rowCount)return res.status(409).json({success:false,message:"Close or force-close the active session before deactivating this till."});}const r=await query(`UPDATE app.till SET till_name=COALESCE($2,till_name),description=$3,cash_payment_account_id=$4,cash_gl_account_id=$5,allow_shared_session=COALESCE($6,allow_shared_session),is_active=COALESCE($7,is_active),updated_at=now(),updated_by=$8 WHERE till_id=$1 RETURNING *`,[req.params.tillId,b.till_name??null,b.description??null,b.cash_payment_account_id??null,b.cash_gl_account_id??null,b.allow_shared_session===undefined?null:Boolean(b.allow_shared_session),b.is_active===undefined?null:Boolean(b.is_active),req.user?.user_id||null]);if(!r.rowCount)return res.status(404).json({success:false,message:"Till not found."});res.json({success:true,data:r.rows[0]});}catch(error){res.status(400).json({success:false,message:"Failed to update till.",error:error.message});}});

const mySession = async(req,res)=>{try{const {companyId,enabled}=await companyAndFeature();if(!enabled)return res.json({success:true,enabled:false,data:null});const r=await query(`SELECT session_id FROM app.cashier_session WHERE company_id=$1 AND cashier_user_id=$2 AND branch_id=$3 AND location_id=$4 AND status IN ('OPEN','CLOSING') ORDER BY opened_at DESC LIMIT 1`,[companyId,req.user?.user_id,req.branchId,req.locationId]);const data=r.rowCount?await sessionSummary(r.rows[0].session_id):null;res.json({success:true,enabled:true,data});}catch(error){res.status(500).json({success:false,message:"Failed to load active till session.",error:error.message});}};
router.get("/my-session", requirePermission("VIEW_TILL_SESSIONS"), mySession);
router.get("/sessions/active", requirePermission("VIEW_TILL_SESSIONS"), mySession);

router.get("/sessions", requirePermission("VIEW_TILL_SESSIONS"), async(req,res)=>{try{const scope=await resolveManagementScope(req,{branchId:req.query.management_branch_id||req.branchId,locationId:req.query.management_location_id||null});const managerView=manager(req);const r=await query(`SELECT s.session_id,s.session_no,s.status,s.opened_at,s.closed_at,s.opening_float,s.expected_cash,s.counted_cash,s.cash_variance,COALESCE((SELECT SUM(amount) FROM app.till_cash_movement m WHERE m.session_id=s.session_id AND m.movement_type='CASH_SALE'),0) AS cash_sales,COALESCE((SELECT SUM(amount) FROM app.till_cash_movement m WHERE m.session_id=s.session_id AND m.movement_type='CASH_IN'),0) AS cash_in,COALESCE((SELECT SUM(amount) FROM app.till_cash_movement m WHERE m.session_id=s.session_id AND m.movement_type='CASH_REFUND'),0) AS cash_refunds,COALESCE((SELECT SUM(amount) FROM app.till_cash_movement m WHERE m.session_id=s.session_id AND m.movement_type='SAFE_DROP'),0) AS safe_drops,COALESCE((SELECT SUM(amount) FROM app.till_cash_movement m WHERE m.session_id=s.session_id AND m.movement_type IN ('CASH_OUT','PAYOUT')),0) AS cash_out,s.cash_disposition,s.opened_by,s.closed_by,ou.full_name AS opened_by_name,cu.full_name AS closed_by_name,s.till_id,s.branch_id,s.location_id,t.till_code,t.till_name,b.branch_name,l.location_name,u.full_name AS cashier_name FROM app.cashier_session s JOIN app.till t ON t.till_id=s.till_id JOIN app.branch b ON b.branch_id=s.branch_id JOIN app.location l ON l.location_id=s.location_id JOIN sec.app_user u ON u.user_id=s.cashier_user_id LEFT JOIN sec.app_user ou ON ou.user_id=s.opened_by LEFT JOIN sec.app_user cu ON cu.user_id=s.closed_by WHERE s.company_id=$1 AND ($2::boolean OR (s.cashier_user_id=$3 AND s.branch_id=$4)) AND s.branch_id=$4 AND ($5::uuid IS NULL OR s.location_id=$5) AND ($6::uuid IS NULL OR s.till_id=$6) ORDER BY s.opened_at DESC LIMIT 500`,[scope.companyId,managerView,req.user?.user_id,scope.branch.branch_id,req.query.management_location_id||null,req.query.selected_till_id||null]);res.json({success:true,count:r.rowCount,data:r.rows});}catch(error){res.status(error.statusCode||500).json({success:false,message:error.message||"Failed to load cashier sessions."});}});

router.get("/sessions/:sessionId", requirePermission("VIEW_TILL_SESSIONS"), async(req,res)=>{try{const data=await sessionSummary(req.params.sessionId);if(!data)return res.status(404).json({success:false,message:"Cashier session not found."});if(!manager(req)&&(data.cashier_user_id!==req.user?.user_id||data.branch_id!==req.branchId))return res.status(403).json({success:false,message:"You are not authorized for this session."});if(manager(req)){const scope=await resolveManagementScope(req,{branchId:req.query.management_branch_id||req.branchId,locationId:req.query.management_location_id||null,requireLocation:true});if(data.branch_id!==scope.branch.branch_id||data.location_id!==scope.location.location_id)return res.status(403).json({success:false,message:"You are not authorized for this session management target."});}res.json({success:true,data});}catch(error){res.status(500).json({success:false,message:"Failed to load cashier session.",error:error.message});}});

router.post("/sessions/open", requirePermission("OPEN_TILL_SESSION"), async (req,res,next)=>{const amount=Number(req.body?.opening_float);if(amount!==0)return next();const client=await pool.connect();try{const b=req.body||{};const branchId=String(b.branch_id||""),locationId=String(b.location_id||"");if(!/^[0-9a-f-]{36}$/i.test(branchId)||!/^[0-9a-f-]{36}$/i.test(locationId))return res.status(400).json({success:false,message:"branch_id and location_id are required valid identifiers."});const companyId=await getActiveCompanyId();const {enabled}=await companyAndFeature();if(!enabled)return res.status(409).json({success:false,message:"Till Management is disabled."});const cashierId=b.cashier_user_id||req.user?.user_id;if(cashierId!==req.user?.user_id&&!manager(req))return res.status(403).json({success:false,message:"Only an authorized manager may open a session for another cashier."});await client.query("BEGIN");const till=await client.query(`SELECT t.* FROM app.till t JOIN app.branch br ON br.branch_id=t.branch_id AND br.company_id=t.company_id AND br.is_active JOIN app.location loc ON loc.location_id=t.location_id AND loc.branch_id=t.branch_id AND loc.company_id=t.company_id AND loc.is_active WHERE t.till_id=$1 AND t.company_id=$2 AND t.is_active AND t.branch_id=$3 AND t.location_id=$4 FOR UPDATE`,[b.till_id,companyId,branchId,locationId]);if(!till.rowCount){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Till is inactive or outside the selected branch/location."});}const access=await client.query(`SELECT u.user_id,ut.can_open FROM sec.app_user u JOIN sec.user_branch ub ON ub.user_id=u.user_id AND ub.branch_id=$2 AND ub.is_active JOIN sec.user_location ul ON ul.user_id=u.user_id AND ul.location_id=$3 AND ul.is_active LEFT JOIN sec.user_till ut ON ut.user_id=u.user_id AND ut.till_id=$1 AND ut.is_active WHERE u.user_id=$4 AND u.is_active`,[till.rows[0].till_id,branchId,locationId,cashierId]);if(!access.rowCount||(!manager(req)&&!access.rows[0].can_open)){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Cashier is not authorized for this till and operating location."});}const config=await client.query("SELECT * FROM app.till_configuration WHERE company_id=$1",[companyId]);if(config.rows[0]?.one_session_per_cashier&&(await client.query("SELECT 1 FROM app.cashier_session WHERE cashier_user_id=$1 AND status IN ('OPEN','CLOSING')",[cashierId])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Cashier already has an active till session."});}if(!till.rows[0].allow_shared_session&&(await client.query("SELECT 1 FROM app.cashier_session WHERE till_id=$1 AND status IN ('OPEN','CLOSING')",[till.rows[0].till_id])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Till already has an active session."});}const session=await client.query(`INSERT INTO app.cashier_session(company_id,branch_id,location_id,till_id,cashier_user_id,opening_float,opening_notes,opened_by) VALUES($1,$2,$3,$4,$5,0,$6,$7) RETURNING *`,[till.rows[0].company_id,till.rows[0].branch_id,till.rows[0].location_id,till.rows[0].till_id,cashierId,b.opening_notes||null,req.user?.user_id||null]);await client.query("COMMIT");res.status(201).json({success:true,data:await sessionSummary(session.rows[0].session_id)});}catch(error){await client.query("ROLLBACK").catch(()=>{});res.status(error.code==='23505'?409:400).json({success:false,message:error.code==='23505'?"An active session conflicts with this till or cashier.":"Failed to open till session.",error:error.message});}finally{client.release();}});

router.use("/sessions/open", (req,res,next)=>{const amount=Number(req.body?.opening_float);if(!Number.isFinite(amount)||amount<0)return res.status(400).json({success:false,message:"Opening float must be a valid amount greater than or equal to zero."});const cashierId=req.body?.cashier_user_id||req.user?.user_id;if(cashierId!==req.user?.user_id&&!manager(req))return res.status(403).json({success:false,message:"Only an authorized manager may open a session for another cashier."});next();});

router.use("/sessions/open", async (req,res,next)=>{try{const cashierId=req.body?.cashier_user_id||req.user?.user_id;const branchId=req.body?.branch_id||req.branchId;const r=await query(`SELECT t.till_id,ut.can_open FROM app.till t JOIN sec.app_user u ON u.user_id=$2 AND u.is_active JOIN sec.user_branch ub ON ub.user_id=u.user_id AND ub.branch_id=t.branch_id AND ub.is_active JOIN sec.user_location ul ON ul.user_id=u.user_id AND ul.location_id=t.location_id AND ul.is_active LEFT JOIN sec.user_till ut ON ut.user_id=u.user_id AND ut.till_id=t.till_id AND ut.is_active WHERE t.till_id=$1 AND t.company_id=$5 AND t.is_active AND t.branch_id=$3 AND t.location_id=$4`,[req.body?.till_id,cashierId,branchId,req.body?.location_id,await getActiveCompanyId()]);if(!r.rowCount)return res.status(403).json({success:false,message:"Cashier or till is not active and authorized for this branch/location."});if(!manager(req)&&(!r.rows[0].can_open))return res.status(403).json({success:false,message:"Cashier is not authorized to open this till."});next();}catch(error){res.status(400).json({success:false,message:"Unable to validate cashier/till authorization.",error:error.message});}});

// Explicit-context opening handler. It precedes the legacy handler below so all new requests use the validated IDs.
router.post("/sessions/open", requirePermission("OPEN_TILL_SESSION"), async (req,res)=>{const client=await pool.connect();try{const b=req.body||{};const branchId=String(b.branch_id||"");const locationId=String(b.location_id||"");if(!/^[0-9a-f-]{36}$/i.test(branchId)||!/^[0-9a-f-]{36}$/i.test(locationId))return res.status(400).json({success:false,message:"branch_id and location_id are required valid identifiers."});const companyId=await getActiveCompanyId();const {enabled}=await companyAndFeature();if(!enabled)return res.status(409).json({success:false,message:"Till Management is disabled."});const cashierId=b.cashier_user_id||req.user?.user_id;await client.query("BEGIN");const till=await client.query(`SELECT t.* FROM app.till t JOIN app.branch br ON br.branch_id=t.branch_id AND br.company_id=t.company_id AND br.is_active JOIN app.location loc ON loc.location_id=t.location_id AND loc.branch_id=t.branch_id AND loc.company_id=t.company_id AND loc.is_active WHERE t.till_id=$1 AND t.company_id=$2 AND t.is_active AND t.branch_id=$3 AND t.location_id=$4 FOR UPDATE`,[b.till_id,companyId,branchId,locationId]);if(!till.rowCount){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Till is inactive or outside the selected branch/location."});}const access=await client.query(`SELECT u.user_id,ut.can_open FROM sec.app_user u JOIN sec.user_branch ub ON ub.user_id=u.user_id AND ub.branch_id=$2 AND ub.is_active JOIN sec.user_location ul ON ul.user_id=u.user_id AND ul.location_id=$3 AND ul.is_active LEFT JOIN sec.user_till ut ON ut.user_id=u.user_id AND ut.till_id=$1 AND ut.is_active WHERE u.user_id=$4 AND u.is_active`,[till.rows[0].till_id,branchId,locationId,cashierId]);if(!access.rowCount||(!manager(req)&&!access.rows[0].can_open)){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Cashier is not authorized for this till and operating location."});}if(cashierId!==req.user?.user_id&&!manager(req)){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Only an authorized manager may open a session for another cashier."});}const config=await client.query("SELECT * FROM app.till_configuration WHERE company_id=$1",[companyId]);if(config.rows[0]?.one_session_per_cashier&&(await client.query("SELECT 1 FROM app.cashier_session WHERE cashier_user_id=$1 AND status IN ('OPEN','CLOSING')",[cashierId])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Cashier already has an active till session."});}if(!till.rows[0].allow_shared_session&&(await client.query("SELECT 1 FROM app.cashier_session WHERE till_id=$1 AND status IN ('OPEN','CLOSING')",[till.rows[0].till_id])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Till already has an active session."});}const session=await client.query(`INSERT INTO app.cashier_session(company_id,branch_id,location_id,till_id,cashier_user_id,opening_float,opening_notes,opened_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[till.rows[0].company_id,till.rows[0].branch_id,till.rows[0].location_id,till.rows[0].till_id,cashierId,Number(b.opening_float),b.opening_notes||null,req.user?.user_id||null]);const s=session.rows[0];await client.query(`INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reason,created_by) VALUES($1,$2,$3,$4,$5,'OPENING_FLOAT',$6,$7,$8)`,[s.company_id,s.branch_id,s.location_id,s.till_id,s.session_id,Number(b.opening_float),b.opening_notes||"Opening float",req.user?.user_id||null]);await client.query("COMMIT");res.status(201).json({success:true,data:await sessionSummary(s.session_id)});}catch(error){await client.query("ROLLBACK").catch(()=>{});res.status(error.code==='23505'?409:400).json({success:false,message:error.code==='23505'?"An active session conflicts with this till or cashier.":"Failed to open till session.",error:error.message});}finally{client.release();}});

router.post("/sessions/open", requirePermission("OPEN_TILL_SESSION"), async(req,res)=>{const client=await pool.connect();try{const {companyId,enabled}=await companyAndFeature();if(!enabled)return res.status(409).json({success:false,message:"Till Management is disabled."});const b=req.body||{};const cashierId=b.cashier_user_id||req.user?.user_id;await client.query("BEGIN");const till=await client.query(`SELECT t.* FROM app.till t WHERE t.till_id=$1 AND t.company_id=$2 AND t.is_active AND t.branch_id=$3 AND t.location_id=$4 FOR UPDATE`,[b.till_id,companyId,req.branchId,b.location_id]);if(!till.rowCount){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Till is inactive or outside the selected branch/location."});}const assigned=await client.query("SELECT can_open FROM sec.user_till WHERE user_id=$1 AND till_id=$2 AND is_active",[cashierId,till.rows[0].till_id]);if(!assigned.rowCount&&!manager(req)){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Cashier is not assigned to this till."});}const config=await client.query("SELECT * FROM app.till_configuration WHERE company_id=$1",[companyId]);if(config.rows[0]?.one_session_per_cashier&& (await client.query("SELECT 1 FROM app.cashier_session WHERE cashier_user_id=$1 AND status IN ('OPEN','CLOSING')",[cashierId])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Cashier already has an active till session."});}if(!till.rows[0].allow_shared_session&&(await client.query("SELECT 1 FROM app.cashier_session WHERE till_id=$1 AND status IN ('OPEN','CLOSING')",[till.rows[0].till_id])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Till already has an active session."});}const session=await client.query(`INSERT INTO app.cashier_session(company_id,branch_id,location_id,till_id,cashier_user_id,opening_float,opening_notes,opened_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[companyId,req.branchId,b.location_id,b.till_id,cashierId,Number(b.opening_float||0),b.opening_notes||null,req.user?.user_id||null]);await client.query(`INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reason,created_by) VALUES($1,$2,$3,$4,$5,'OPENING_FLOAT',$6,$7,$8)`,[companyId,req.branchId,b.location_id,b.till_id,session.rows[0].session_id,Number(b.opening_float||0),b.opening_notes||"Opening float",req.user?.user_id||null]);await client.query("COMMIT");res.status(201).json({success:true,data:await sessionSummary(session.rows[0].session_id)});}catch(error){await client.query("ROLLBACK").catch(()=>{});res.status(error.code==='23505'?409:400).json({success:false,message:error.code==='23505'?"An active session conflicts with this till or cashier.":"Failed to open till session.",error:error.message});}finally{client.release();}});

router.post("/sessions/:sessionId/movements", requirePermission("CASH_IN_OUT"), async(req,res)=>{const client=await pool.connect();try{const b=req.body||{};const type=String(b.movement_type||"").toUpperCase();if(!["CASH_IN","CASH_OUT","PAYOUT","SAFE_DROP"].includes(type))return res.status(400).json({success:false,message:"movement_type must be CASH_IN, CASH_OUT, PAYOUT, or SAFE_DROP."});if(!Number.isFinite(Number(b.amount))||Number(b.amount)<=0||!String(b.reason||"").trim())return res.status(400).json({success:false,message:"A positive amount and reason are required."});await client.query("BEGIN");const s=await client.query("SELECT * FROM app.cashier_session WHERE session_id=$1 AND status='OPEN' FOR UPDATE",[req.params.sessionId]);if(!s.rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Only an OPEN session accepts cash movements."});}if(!allBranches(req)&&s.rows[0].branch_id!==req.branchId){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"You are not authorized for this session branch."});}const r=await client.query(`INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reference,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[s.rows[0].company_id,s.rows[0].branch_id,s.rows[0].location_id,s.rows[0].till_id,s.rows[0].session_id,type,Number(b.amount),b.reference||null,String(b.reason).trim(),req.user?.user_id||null]);await client.query("COMMIT");res.status(201).json({success:true,data:r.rows[0]});}catch(error){await client.query("ROLLBACK").catch(()=>{});res.status(400).json({success:false,message:"Failed to record cash movement.",error:error.message});}finally{client.release();}});

router.use("/sessions/:sessionId/close", async(req,res,next)=>{try{const companyId=await getActiveCompanyId();const s=await query("SELECT * FROM app.cashier_session WHERE session_id=$1 AND company_id=$2",[req.params.sessionId,companyId]);if(!s.rowCount)return res.status(404).json({success:false,message:"Cashier session not found."});const row=s.rows[0];const actor=req.user?.user_id;if(row.cashier_user_id!==actor&&!manager(req))return res.status(403).json({success:false,message:"Only the cashier or an authorized manager may close this session."});const access=await query(`SELECT ub.branch_id,ul.location_id,ut.can_close FROM sec.user_branch ub JOIN sec.user_location ul ON ul.user_id=ub.user_id AND ul.location_id=$3 AND ul.is_active LEFT JOIN sec.user_till ut ON ut.user_id=ub.user_id AND ut.till_id=$4 AND ut.is_active WHERE ub.user_id=$1 AND ub.branch_id=$2 AND ub.is_active`,[actor,row.branch_id,row.location_id,row.till_id]);if(!manager(req)&&(!access.rowCount||!access.rows[0].can_close))return res.status(403).json({success:false,message:"You are not authorized to close this session at its branch/location or till."});req.branchId=row.branch_id;req.locationId=row.location_id;next();}catch(error){res.status(403).json({success:false,message:"Session close authorization could not be verified.",error:error.message});}});

// Phase 8F close/disposition handler. It precedes the legacy close handler.
router.post("/sessions/:sessionId/close", requirePermission("CLOSE_OWN_TILL_SESSION"), async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {}, disposition = String(b.cash_disposition || "").toUpperCase();
    await client.query("BEGIN");
    const locked = await client.query("SELECT s.*,c.cash_variance_tolerance,c.require_variance_approval FROM app.cashier_session s JOIN app.till_configuration c ON c.company_id=s.company_id WHERE s.session_id=$1 FOR UPDATE", [req.params.sessionId]);
    if (!locked.rowCount) throw Object.assign(new Error("Cashier session not found."), { statusCode: 404 });
    const row = locked.rows[0];
    if (row.branch_id !== req.branchId && !allBranches(req)) throw Object.assign(new Error("You are not authorized for this session branch."), { statusCode: 403 });
    if (row.cashier_user_id !== req.user?.user_id && !manager(req)) throw Object.assign(new Error("Only the cashier or an authorized manager may close this session."), { statusCode: 403 });
    if (!["OPEN", "CLOSING"].includes(row.status)) throw Object.assign(new Error("Session is already closed or reconciled."), { statusCode: 409 });
    const expected = await client.query("SELECT COALESCE(SUM(CASE WHEN movement_type IN ('OPENING_FLOAT','CASH_SALE','CASH_IN') THEN amount ELSE -amount END),0) AS expected FROM app.till_cash_movement WHERE session_id=$1", [req.params.sessionId]);
    const expectedCash = Number(expected.rows[0].expected), counted = Number(b.counted_cash);
    if (!Number.isFinite(counted) || counted < 0) throw Object.assign(new Error("counted_cash must be a non-negative number."), { statusCode: 400 });
    const variance = Number((counted - expectedCash).toFixed(2)), tolerance = Number(row.cash_variance_tolerance || 0);
    if (Math.abs(variance) > tolerance && !String(b.closing_notes || "").trim()) throw Object.assign(new Error("Closing notes are required when variance exceeds tolerance."), { statusCode: 400 });
    if (!disposition || !["SAFE_TRANSFER", "CARRY_FORWARD", "LEAVE_IN_TILL", "HANDOVER"].includes(disposition)) throw Object.assign(new Error("Choose a cash disposition before closing the session."), { statusCode: 400 });
    if (disposition === "LEAVE_IN_TILL" && !manager(req)) throw Object.assign(new Error("Leaving cash in a till requires manager authorization."), { statusCode: 403 });
    const dispositionAmount = Number(b.disposition_amount ?? counted);
    if (!Number.isFinite(dispositionAmount) || dispositionAmount < 0 || dispositionAmount > counted) throw Object.assign(new Error("Disposition amount cannot exceed counted cash."), { statusCode: 400 });
    if (["CARRY_FORWARD", "HANDOVER"].includes(disposition) && dispositionAmount !== counted) throw Object.assign(new Error("Carry-forward and handover amounts must equal counted cash."), { statusCode: 400 });
    if (Array.isArray(b.denominations)) { await client.query("DELETE FROM app.till_cash_count WHERE session_id=$1", [req.params.sessionId]); for (const item of b.denominations) if (Number(item.denomination) > 0 && Number(item.quantity) >= 0) await client.query("INSERT INTO app.till_cash_count(session_id,denomination,quantity) VALUES($1,$2,$3)", [req.params.sessionId, Number(item.denomination), Number(item.quantity)]); }
    const needsApproval = Boolean(row.require_variance_approval) && Math.abs(variance) > tolerance && !manager(req);
    if (needsApproval) throw Object.assign(new Error("Variance approval is required before applying a closing disposition."), { statusCode: 409 });
    let handoverId = null, safeTransferAmount = null, handoverAmount = null;
    if (disposition === "SAFE_TRANSFER" && dispositionAmount > 0) {
      const accounts = (await cashAccountsFor(client, row.company_id, row.till_id)).rows[0];
      if (!accounts?.cash_payment_account_id || !accounts?.safe_cash_payment_account_id || accounts.till_channel !== "CASH" || accounts.safe_channel !== "CASH" || !accounts.till_active || !accounts.safe_active || accounts.cash_payment_account_id === accounts.safe_cash_payment_account_id) throw Object.assign(new Error("Configure two active, different CASH accounts before Safe Transfer."), { statusCode: 409 });
      const movement = await client.query(`INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reason,source_account_id,destination_account_id,created_by) VALUES($1,$2,$3,$4,$5,'SAFE_DROP',$6,'Session close Safe Transfer',$7,$8,$9) RETURNING movement_id`, [row.company_id,row.branch_id,row.location_id,row.till_id,row.session_id,dispositionAmount,accounts.cash_payment_account_id,accounts.safe_cash_payment_account_id,req.user?.user_id || null]);
      await createCashTransferJournal(client, "SAFE_TRANSFER", row, movement.rows[0].movement_id, accounts.cash_payment_account_id, accounts.safe_cash_payment_account_id, dispositionAmount);
      safeTransferAmount = dispositionAmount;
    } else if (disposition === "HANDOVER") {
      if (!b.handover_to_user_id) throw Object.assign(new Error("A receiving cashier is required for handover."), { statusCode: 400 });
      const handover = await client.query(`INSERT INTO app.till_cash_handover(company_id,branch_id,location_id,till_id,source_session_id,source_cashier_user_id,receiving_cashier_user_id,amount,proposed_by,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING handover_id`, [row.company_id,row.branch_id,row.location_id,row.till_id,row.session_id,row.cashier_user_id,b.handover_to_user_id,dispositionAmount,req.user?.user_id || null,b.handover_notes || null]);
      handoverId = handover.rows[0].handover_id; handoverAmount = dispositionAmount;
    } else if (disposition === "CARRY_FORWARD") handoverAmount = dispositionAmount;
    const updated = await client.query(`UPDATE app.cashier_session SET status=$2,closed_at=CASE WHEN $2='CLOSED' THEN now() ELSE closed_at END,expected_cash=$3,counted_cash=$4,cash_variance=$5,closing_notes=$6,closed_by=$7,cash_disposition=$8,safe_transfer_amount=$9,handover_amount=$10,handover_to_user_id=$11,handover_id=$12,updated_at=now() WHERE session_id=$1 RETURNING *`, [row.session_id, needsApproval ? "CLOSING" : "CLOSED", Math.max(0, expectedCash - (safeTransferAmount || 0)), counted, variance, String(b.closing_notes || "").trim() || null, req.user?.user_id || null, disposition, safeTransferAmount, handoverAmount, b.handover_to_user_id || null, handoverId]);
    await client.query("COMMIT"); res.json({ success: true, data: await sessionSummary(updated.rows[0].session_id) });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(error.statusCode || 400).json({ success: false, message: error.message || "Failed to close till session.", error: error.message }); } finally { client.release(); }
});

router.post("/handovers/:handoverId/accept", requirePermission("OPEN_TILL_SESSION"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const h = await client.query("SELECT * FROM app.till_cash_handover WHERE handover_id=$1 AND status='PROPOSED' FOR UPDATE", [req.params.handoverId]);
    if (!h.rowCount) throw Object.assign(new Error("Handover is not available for acceptance."), { statusCode: 409 });
    const row = h.rows[0];
    if (row.receiving_cashier_user_id !== req.user?.user_id && !manager(req)) throw Object.assign(new Error("Only the receiving cashier or manager may accept this handover."), { statusCode: 403 });
    const receivingSessionId = req.body?.receiving_session_id;
    const session = await client.query("SELECT * FROM app.cashier_session WHERE session_id=$1 AND till_id=$2 AND cashier_user_id=$3 AND status='OPEN' FOR UPDATE", [receivingSessionId, row.till_id, row.receiving_cashier_user_id]);
    if (!session.rowCount) throw Object.assign(new Error("Open the receiving cashier session on the same till before accepting handover."), { statusCode: 409 });
    const existingOpening = await client.query("SELECT movement_id FROM app.till_cash_movement WHERE session_id=$1 AND movement_type='OPENING_FLOAT' LIMIT 1", [receivingSessionId]);
    if (!existingOpening.rowCount && Number(row.amount) > 0) await client.query("INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reason,source_document_type,source_document_id,created_by) SELECT company_id,branch_id,location_id,till_id,session_id,'OPENING_FLOAT',$2,$3,'HANDOVER',$4,$5 FROM app.cashier_session WHERE session_id=$1", [receivingSessionId, row.amount, "Accepted cashier handover", row.handover_id, req.user?.user_id || null]);
    await client.query("UPDATE app.till_cash_handover SET status='ACCEPTED',receiving_session_id=$2,accepted_by=$3,accepted_at=now() WHERE handover_id=$1", [row.handover_id, receivingSessionId, req.user?.user_id || null]);
    await client.query("UPDATE app.cashier_session SET opening_source='CARRY_FORWARD',opening_source_session_id=$2,opening_float=$3,opening_notes=COALESCE(opening_notes,'Accepted cashier handover') WHERE session_id=$1", [receivingSessionId, row.source_session_id, row.amount]);
    await client.query("COMMIT"); res.json({ success: true, data: await sessionSummary(receivingSessionId) });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(error.statusCode || 400).json({ success: false, message: error.message }); } finally { client.release(); }
});

router.post("/sessions/:sessionId/approve", requirePermission("APPROVE_TILL_VARIANCE"), async(req,res)=>{try{const r=await query("UPDATE app.cashier_session SET status='CLOSED',closed_at=COALESCE(closed_at,now()),approved_by=$2,approved_at=now(),updated_at=now() WHERE session_id=$1 AND status='CLOSING' AND ($3::boolean OR branch_id=$4) RETURNING session_id",[req.params.sessionId,req.user?.user_id||null,allBranches(req),req.branchId]);if(!r.rowCount)return res.status(409).json({success:false,message:"Session is not awaiting variance approval or is outside your branch."});res.json({success:true,data:await sessionSummary(req.params.sessionId)});}catch(error){res.status(400).json({success:false,message:"Failed to approve till variance.",error:error.message});}});

router.post("/sessions/:sessionId/reconcile", requirePermission("RECONCILE_TILL_SESSION"), async(req,res)=>{try{const r=await query("UPDATE app.cashier_session SET status='RECONCILED',approved_by=COALESCE(approved_by,$2),approved_at=COALESCE(approved_at,now()),updated_at=now() WHERE session_id=$1 AND status='CLOSED' AND ($3::boolean OR branch_id=$4) RETURNING session_id",[req.params.sessionId,req.user?.user_id||null,allBranches(req),req.branchId]);if(!r.rowCount)return res.status(409).json({success:false,message:"Only CLOSED sessions in your branch can be reconciled."});res.json({success:true,data:await sessionSummary(req.params.sessionId)});}catch(error){res.status(400).json({success:false,message:"Failed to reconcile till session.",error:error.message});}});

router.post("/sessions/:sessionId/force-close", requirePermission("CLOSE_ANY_TILL_SESSION"), async(req,res)=>{try{const scope=await resolveManagementScope(req,{branchId:req.query.management_branch_id||req.branchId,locationId:req.query.management_location_id||null,requireLocation:true});const r=await query("UPDATE app.cashier_session SET status='CLOSED',closed_at=COALESCE(closed_at,now()),closing_notes=COALESCE(closing_notes,$2),closed_by=$3,updated_at=now() WHERE session_id=$1 AND status IN ('OPEN','CLOSING') AND branch_id=$4 AND location_id=$5 RETURNING session_id",[req.params.sessionId,String(req.body?.reason||"").trim()||"Force closed by authorized manager",req.user?.user_id||null,scope.branch.branch_id,scope.location.location_id]);if(!r.rowCount)return res.status(409).json({success:false,message:"Session is not open or is outside the managed branch/location."});res.json({success:true,data:await sessionSummary(req.params.sessionId)});}catch(error){res.status(error.statusCode||400).json({success:false,message:error.message||"Failed to force-close session."});}});

export default router;
