import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserRoles, requirePermission } from "../middleware/permissions.js";
import { getActiveCompanyId } from "../services/businessFeatures.service.js";
import { logBusinessEvent } from "../services/audit.service.js";

const router = express.Router();
router.use(requireAuth);

const compatible = (from, to) => {
  const pair = `${String(from).toUpperCase()}->${String(to).toUpperCase()}`;
  return ["CASH->CASH", "CASH->BANK", "BANK->CASH"].includes(pair);
};

async function accountForUpdate(client, accountId) {
  const result = await client.query(`
    SELECT pac.account_id, pac.channel_type, pac.provider_name, pac.is_payment_account,
           pac.account_role, pac.branch_id, pac.allow_cross_branch_funding,
           pac.allow_negative, pac.overdraft_limit, pac.overdraft_expiry_date,
           pac.is_active, ga.account_code, ga.account_name, ga.account_type
    FROM fin.payment_account_control pac
    JOIN fin.gl_account ga ON ga.account_id=pac.account_id
    WHERE pac.account_id=$1
    FOR UPDATE OF pac, ga
  `, [accountId]);
  return result.rows[0] || null;
}

async function transferDetails(client, transferId) {
  const result = await client.query(`
    SELECT t.*, fa.account_code AS from_account_code, fa.account_name AS from_account_name,
           fp.provider_name AS from_provider_name, fp.channel_type AS from_channel_type,
           ta.account_code AS to_account_code, ta.account_name AS to_account_name,
           tp.provider_name AS to_provider_name, tp.channel_type AS to_channel_type,
           cu.full_name AS created_by_name, pu.full_name AS posted_by_name,
           ru.full_name AS reversed_by_name, gj.journal_no
    FROM fin.payment_account_transfer t
    JOIN fin.payment_account_control fp ON fp.account_id=t.from_payment_account_id
    JOIN fin.gl_account fa ON fa.account_id=fp.account_id
    JOIN fin.payment_account_control tp ON tp.account_id=t.to_payment_account_id
    JOIN fin.gl_account ta ON ta.account_id=tp.account_id
    LEFT JOIN sec.app_user cu ON cu.user_id=t.created_by
    LEFT JOIN sec.app_user pu ON pu.user_id=t.posted_by
    LEFT JOIN sec.app_user ru ON ru.user_id=t.reversed_by
    LEFT JOIN fin.gl_journal gj ON gj.journal_id=t.journal_id
    WHERE t.transfer_id=$1
  `, [transferId]);
  return result.rows[0] || null;
}

async function crossBranchAccount(client, accountId) {
  return accountForUpdate(client, accountId);
}

async function crossBranchPolicy(client, companyId) {
  const result = await client.query(`
    SELECT c.cash_in_transit_account_id, ga.account_code, ga.account_name
    FROM fin.cross_branch_account_configuration c
    JOIN fin.gl_account ga ON ga.account_id=c.cash_in_transit_account_id
    WHERE c.company_id=$1 AND c.is_active=true AND ga.is_active=true
  `, [companyId]);
  return result.rows[0] || null;
}

async function branchInCompany(client, branchId, companyId) {
  const result = await client.query(
    "SELECT branch_id, branch_name, company_id FROM app.branch WHERE branch_id=$1 AND company_id=$2 AND is_active=true",
    [branchId, companyId]
  );
  return result.rows[0] || null;
}

async function canAccessBranch(client, req, branchId) {
  if (!req.branchId || req.branchId === branchId || getUserRoles(req).some((role) => ["ADMIN", "HEAD_OFFICE", "AUDITOR"].includes(role))) return true;
  const result = await client.query("SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active=true", [req.user.user_id, branchId]);
  return result.rowCount > 0;
}

async function assertCrossAccount(client, account, branchId, role) {
  if (!account || !account.is_active || !account.is_payment_account || account.account_type !== "ASSET" || account.channel_type !== "CASH") {
    throw Object.assign(new Error("Cross-branch funding supports active CASH payment accounts only."), { statusCode: 400 });
  }
  if (role === "SOURCE" && !account.allow_cross_branch_funding) {
    throw Object.assign(new Error("This source account is not configured for cross-branch funding."), { statusCode: 400 });
  }
  if (role === "DESTINATION" && (account.account_role !== "PETTY_CASH" || account.branch_id !== branchId)) {
    throw Object.assign(new Error("The destination must be the destination branch's Petty Cash account."), { statusCode: 400 });
  }
}

async function createBranchJournal(client, prefix, date, description, module, sourceId, branchId, debitAccount, creditAccount, amount) {
  const created = await client.query("SELECT fin.create_journal($1,$2::date,$3::text,$4::text,$5::uuid) AS journal_id", [prefix, date, description, module, sourceId]);
  const journalId = created.rows[0].journal_id;
  await client.query("UPDATE fin.gl_journal SET branch_id=$2 WHERE journal_id=$1", [journalId, branchId]);
  await client.query("SELECT fin.add_journal_line($1,$2,NULL,$3,$4,0)", [journalId, debitAccount, `${description} debit`, amount]);
  await client.query("SELECT fin.add_journal_line($1,$2,NULL,$3,0,$4)", [journalId, creditAccount, `${description} credit`, amount]);
  await client.query("SELECT fin.assert_balanced($1::uuid)", [journalId]);
  return journalId;
}

router.get("/", requirePermission("VIEW_PAYMENT_ACCOUNT_TRANSFERS"), async (req, res) => {
  try {
    const companyId = await getActiveCompanyId();
    const result = await query(`
      SELECT t.transfer_id,t.transfer_no,t.transaction_date,t.amount,t.reason,t.reference,t.status,
             t.journal_id,t.created_at,t.posted_at,
             fa.account_code AS from_account_code,fa.account_name AS from_account_name,
             ta.account_code AS to_account_code,ta.account_name AS to_account_name,
             cu.full_name AS created_by_name,gj.journal_no
      FROM fin.payment_account_transfer t
      JOIN fin.payment_account_control fp ON fp.account_id=t.from_payment_account_id
      JOIN fin.gl_account fa ON fa.account_id=fp.account_id
      JOIN fin.payment_account_control tp ON tp.account_id=t.to_payment_account_id
      JOIN fin.gl_account ta ON ta.account_id=tp.account_id
      LEFT JOIN sec.app_user cu ON cu.user_id=t.created_by
      LEFT JOIN fin.gl_journal gj ON gj.journal_id=t.journal_id
      WHERE t.company_id=$2 AND ($1::uuid IS NULL OR t.branch_id=$1 OR t.source_branch_id=$1 OR t.destination_branch_id=$1 OR t.branch_id IS NULL)
      ORDER BY t.transaction_date DESC,t.created_at DESC
      LIMIT 200
    `, [req.branchId || null, companyId]);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to load payment-account transfers.", error: error.message }); }
});

router.get("/accounts", requirePermission("CREATE_PAYMENT_ACCOUNT_TRANSFER"), async (req, res) => {
  try {
    const requestedBranch = req.query.branch_id || req.branchId || null;
    if (requestedBranch && !(await canAccessBranch({ query }, req, requestedBranch))) return res.status(403).json({ success: false, message: "You are not authorized for the requested branch." });
    const result = await query(`
      SELECT v.account_id,v.account_code,v.account_name,v.account_type,v.channel_type,v.provider_name,
             pac.account_role,pac.branch_id,
             v.is_active,v.allow_negative,v.overdraft_limit,v.overdraft_expiry_date,v.current_balance,v.available_balance
      FROM fin.v_payment_account_balance v
      JOIN fin.payment_account_control pac ON pac.account_id=v.account_id
      WHERE v.is_payment_account=true AND v.is_active=true AND v.account_type='ASSET'
        AND (pac.branch_id IS NULL OR pac.branch_id=$1)
      ORDER BY account_code
    `, [requestedBranch]);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to load transferable accounts.", error: error.message }); }
});

router.post("/cross-branch", requirePermission("CREATE_CROSS_BRANCH_TRANSFER"), async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const sourceBranchId = b.source_branch_id;
    const destinationBranchId = b.destination_branch_id;
    const fromId = b.from_payment_account_id;
    const toId = b.to_payment_account_id;
    const amount = Number(b.amount);
    const reason = String(b.reason || "").trim();
    const idempotencyKey = String(b.idempotency_key || "").trim();
    const transactionDate = b.transaction_date || new Date().toISOString().slice(0, 10);
    if (!sourceBranchId || !destinationBranchId || sourceBranchId === destinationBranchId) throw Object.assign(new Error("Cross-branch transfer requires two different branches."), { statusCode: 400 });
    if (!fromId || !toId || fromId === toId) throw Object.assign(new Error("Source and destination accounts must be different."), { statusCode: 400 });
    if (!Number.isFinite(amount) || amount <= 0 || !reason || !idempotencyKey) throw Object.assign(new Error("Amount, reason, and idempotency_key are required."), { statusCode: 400 });
    await client.query("BEGIN");
    const companyId = await getActiveCompanyId();
    const sourceBranch = await branchInCompany(client, sourceBranchId, companyId);
    const destinationBranch = await branchInCompany(client, destinationBranchId, companyId);
    if (!sourceBranch || !destinationBranch) throw Object.assign(new Error("Both branches must be active branches of the same company."), { statusCode: 400 });
    if (req.branchId && req.branchId !== sourceBranchId) throw Object.assign(new Error("The source branch must be your authorized operating branch."), { statusCode: 403 });
    if (!(await canAccessBranch(client, req, destinationBranchId))) throw Object.assign(new Error("You are not authorized for the destination branch."), { statusCode: 403 });
    const prior = await client.query("SELECT transfer_id FROM fin.payment_account_transfer WHERE idempotency_key=$1 FOR UPDATE", [idempotencyKey]);
    if (prior.rowCount) { const data = await transferDetails(client, prior.rows[0].transfer_id); await client.query("COMMIT"); return res.json({ success: true, duplicate: true, data }); }
    const ids = [fromId, toId].sort();
    const first = await crossBranchAccount(client, ids[0]);
    const second = await crossBranchAccount(client, ids[1]);
    const from = ids[0] === fromId ? first : second;
    const to = ids[0] === toId ? first : second;
    await assertCrossAccount(client, from, sourceBranchId, "SOURCE");
    await assertCrossAccount(client, to, destinationBranchId, "DESTINATION");
    if (from.account_role === "PETTY_CASH" && from.branch_id !== sourceBranchId) throw Object.assign(new Error("Source Petty Cash belongs to a different branch."), { statusCode: 400 });
    const till = await client.query("SELECT 1 FROM app.till WHERE is_active=true AND cash_payment_account_id=$1 LIMIT 1", [toId]);
    if (till.rowCount) throw Object.assign(new Error("Active tills cannot receive cross-branch funding directly."), { statusCode: 400 });
    const balance = await client.query("SELECT available_balance FROM fin.v_payment_account_balance WHERE account_id=$1", [fromId]);
    if (!from.allow_negative && Number(balance.rows[0]?.available_balance || 0) < amount) throw Object.assign(new Error("Source account has insufficient available balance."), { statusCode: 400 });
    if (from.allow_negative && from.overdraft_expiry_date && new Date(from.overdraft_expiry_date) < new Date(transactionDate)) throw Object.assign(new Error("Source account overdraft authorization has expired."), { statusCode: 400 });
    const nextNumber = await client.query("SELECT nextval('fin.payment_account_transfer_no_seq') AS n");
    const number = `CBF-${String(transactionDate).replaceAll("-", "")}-${String(nextNumber.rows[0].n).padStart(6, "0")}`;
    const inserted = await client.query(`INSERT INTO fin.payment_account_transfer(transfer_no,company_id,branch_id,source_branch_id,destination_branch_id,transfer_type,transaction_date,from_payment_account_id,to_payment_account_id,amount,reason,reference,status,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,'CROSS_BRANCH',$6,$7,$8,$9,$10,$11,'DRAFT',$12,$13) RETURNING transfer_id`, [number, companyId, sourceBranchId, sourceBranchId, destinationBranchId, transactionDate, fromId, toId, amount, reason, b.reference || null, idempotencyKey, req.user.user_id]);
    const transferId = inserted.rows[0].transfer_id;
    await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_CREATED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transferId, documentNo: number, companyId, branchId: sourceBranchId, userId: req.user.user_id, amount, reason, reference: b.reference || null, metadata: { source_branch_id: sourceBranchId, destination_branch_id: destinationBranchId, from_account_id: fromId, to_account_id: toId } });
    const data = await transferDetails(client, transferId);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(error.statusCode || 400).json({ success: false, message: error.message || "Cross-branch transfer creation failed." }); }
  finally { client.release(); }
});

async function transitionCrossBranch(req, res, action) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT * FROM fin.payment_account_transfer WHERE transfer_id=$1 AND transfer_type='CROSS_BRANCH' FOR UPDATE", [req.params.transferId]);
    if (!locked.rowCount) throw Object.assign(new Error("Cross-branch transfer not found."), { statusCode: 404 });
    const transfer = locked.rows[0];
    const companyId = transfer.company_id;
    if (action === "submit") {
      if (transfer.status !== "DRAFT") throw Object.assign(new Error("Only DRAFT transfers can be submitted."), { statusCode: 409 });
      await client.query("UPDATE fin.payment_account_transfer SET status='SUBMITTED',submitted_by=$2,submitted_at=now() WHERE transfer_id=$1", [transfer.transfer_id, req.user.user_id]);
      await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_SUBMITTED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId, branchId: transfer.source_branch_id, userId: req.user.user_id, amount: transfer.amount, reason: transfer.reason, reference: transfer.reference });
    } else if (action === "approve") {
      if (transfer.status !== "SUBMITTED") throw Object.assign(new Error("Only SUBMITTED transfers can be approved."), { statusCode: 409 });
      if (transfer.created_by === req.user.user_id) throw Object.assign(new Error("The maker cannot approve their own cross-branch transfer."), { statusCode: 403 });
      await client.query("UPDATE fin.payment_account_transfer SET status='APPROVED',approved_by=$2,approved_at=now() WHERE transfer_id=$1", [transfer.transfer_id, req.user.user_id]);
      await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_APPROVED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId, branchId: transfer.source_branch_id, userId: req.user.user_id, amount: transfer.amount, reason: transfer.reason, reference: transfer.reference });
    } else if (action === "dispatch") {
      if (!['APPROVED'].includes(transfer.status)) throw Object.assign(new Error("Only APPROVED transfers can be dispatched."), { statusCode: 409 });
      if (req.branchId && req.branchId !== transfer.source_branch_id) throw Object.assign(new Error("Dispatch must be performed from the source branch."), { statusCode: 403 });
      const ids = [transfer.from_payment_account_id, transfer.to_payment_account_id].sort();
      const a = await crossBranchAccount(client, ids[0]); const b = await crossBranchAccount(client, ids[1]);
      const from = ids[0] === transfer.from_payment_account_id ? a : b; const to = ids[0] === transfer.to_payment_account_id ? a : b;
      await assertCrossAccount(client, from, transfer.source_branch_id, "SOURCE");
      await assertCrossAccount(client, to, transfer.destination_branch_id, "DESTINATION");
      const policy = await crossBranchPolicy(client, companyId);
      if (!policy) throw Object.assign(new Error("Configure a company Cash in Transit account before dispatch."), { statusCode: 409 });
      const balance = await client.query("SELECT available_balance FROM fin.v_payment_account_balance WHERE account_id=$1", [from.account_id]);
      if (!from.allow_negative && Number(balance.rows[0]?.available_balance || 0) < Number(transfer.amount)) throw Object.assign(new Error("Source account has insufficient available balance."), { statusCode: 400 });
      const journalId = await createBranchJournal(client, "CBF-DISPATCH", transfer.transaction_date, `Cross-branch dispatch ${transfer.transfer_no}`, "CROSS_BRANCH_TRANSFER", transfer.transfer_id, transfer.source_branch_id, policy.cash_in_transit_account_id, from.account_id, transfer.amount);
      await client.query("UPDATE fin.payment_account_transfer SET status='IN_TRANSIT',dispatched_by=$2,dispatched_at=now(),dispatch_reference=$3,source_journal_id=$4,in_transit_journal_id=$4 WHERE transfer_id=$1", [transfer.transfer_id, req.user.user_id, req.body?.reference || transfer.reference || null, journalId]);
      await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_DISPATCHED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId, branchId: transfer.source_branch_id, userId: req.user.user_id, amount: transfer.amount, journalId, reason: transfer.reason, reference: transfer.reference, metadata: { cash_in_transit_account_id: policy.cash_in_transit_account_id } });
    } else if (action === "receive") {
      if (!['IN_TRANSIT','DISPATCHED'].includes(transfer.status)) throw Object.assign(new Error("Only dispatched transfers can be received."), { statusCode: 409 });
      if (req.branchId && req.branchId !== transfer.destination_branch_id) throw Object.assign(new Error("Receipt must be performed at the destination branch."), { statusCode: 403 });
      const receivedAmount = Number(req.body?.received_amount);
      if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) throw Object.assign(new Error("received_amount is required."), { statusCode: 400 });
      if (receivedAmount !== Number(transfer.amount)) {
        await client.query("UPDATE fin.payment_account_transfer SET status='RECEIPT_VARIANCE',received_amount=$2,received_by=$3,received_at=now(),receipt_reference=$4,receipt_notes=$5 WHERE transfer_id=$1", [transfer.transfer_id, receivedAmount, req.user.user_id, req.body?.reference || null, req.body?.notes || null]);
        await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_RECEIPT_VARIANCE", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId, branchId: transfer.destination_branch_id, userId: req.user.user_id, amount: receivedAmount, reason: req.body?.notes || "Received amount differs from dispatch.", reference: req.body?.reference || transfer.reference, metadata: { dispatched_amount: transfer.amount, received_amount: receivedAmount } });
      } else {
        const policy = await crossBranchPolicy(client, companyId);
        const to = await crossBranchAccount(client, transfer.to_payment_account_id);
        await assertCrossAccount(client, to, transfer.destination_branch_id, "DESTINATION");
        if (!policy) throw Object.assign(new Error("Configure a company Cash in Transit account before receipt."), { statusCode: 409 });
        const journalId = await createBranchJournal(client, "CBF-RECEIPT", transfer.transaction_date, `Cross-branch receipt ${transfer.transfer_no}`, "CROSS_BRANCH_TRANSFER", transfer.transfer_id, transfer.destination_branch_id, to.account_id, policy.cash_in_transit_account_id, transfer.amount);
        await client.query("UPDATE fin.payment_account_transfer SET status='COMPLETED',received_amount=$2,received_by=$3,received_at=now(),receipt_reference=$4,receipt_notes=$5,destination_journal_id=$6 WHERE transfer_id=$1", [transfer.transfer_id, receivedAmount, req.user.user_id, req.body?.reference || null, req.body?.notes || null, journalId]);
        await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_RECEIVED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId, branchId: transfer.destination_branch_id, userId: req.user.user_id, amount: transfer.amount, journalId, reason: transfer.reason, reference: transfer.reference });
      }
    } else if (action === "cancel") {
      if (!['DRAFT','SUBMITTED','APPROVED'].includes(transfer.status)) throw Object.assign(new Error("Only un-dispatched transfers can be cancelled."), { statusCode: 409 });
      await client.query("UPDATE fin.payment_account_transfer SET status='CANCELLED',cancelled_by=$2,cancelled_at=now(),cancellation_reason=$3 WHERE transfer_id=$1", [transfer.transfer_id, req.user.user_id, String(req.body?.reason || "Cancelled by authorized user").trim()]);
      await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_CANCELLED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId, branchId: transfer.source_branch_id, userId: req.user.user_id, amount: transfer.amount, reason: String(req.body?.reason || "Cancelled by authorized user").trim(), reference: transfer.reference });
    } else if (action === "reverse") {
      if (transfer.status !== "COMPLETED") throw Object.assign(new Error("Only COMPLETED transfers can be reversed."), { statusCode: 409 });
      const policy = await crossBranchPolicy(client, companyId);
      if (!policy) throw Object.assign(new Error("Configure a company Cash in Transit account before reversal."), { statusCode: 409 });
      const source = await crossBranchAccount(client, transfer.from_payment_account_id); const destination = await crossBranchAccount(client, transfer.to_payment_account_id);
      const destReversal = await createBranchJournal(client, "CBF-REV-D", transfer.transaction_date, `Reverse cross-branch receipt ${transfer.transfer_no}`, "CROSS_BRANCH_TRANSFER", transfer.transfer_id, transfer.destination_branch_id, policy.cash_in_transit_account_id, destination.account_id, transfer.amount);
      const sourceReversal = await createBranchJournal(client, "CBF-REV-S", transfer.transaction_date, `Reverse cross-branch dispatch ${transfer.transfer_no}`, "CROSS_BRANCH_TRANSFER", transfer.transfer_id, transfer.source_branch_id, source.account_id, policy.cash_in_transit_account_id, transfer.amount);
      await client.query("UPDATE fin.payment_account_transfer SET status='REVERSED',reversed_by=$2,reversed_at=now(),reversal_journal_id=$3,reversal_reason=$4 WHERE transfer_id=$1", [transfer.transfer_id, req.user.user_id, sourceReversal, String(req.body?.reason || "Reversed by authorized user").trim()]);
      await logBusinessEvent(client, { eventCode: "CROSS_BRANCH_TRANSFER_REVERSED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId, branchId: transfer.source_branch_id, userId: req.user.user_id, amount: transfer.amount, journalId: sourceReversal, reason: String(req.body?.reason || "Reversed by authorized user").trim(), reference: transfer.reference, metadata: { destination_reversal_journal_id: destReversal } });
    }
    const data = await transferDetails(client, transfer.transfer_id);
    await client.query("COMMIT");
    res.json({ success: true, data });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(error.statusCode || 400).json({ success: false, message: error.message || "Cross-branch transfer action failed." }); }
  finally { client.release(); }
}

router.post("/:transferId/submit", requirePermission("CREATE_CROSS_BRANCH_TRANSFER"), (req, res) => transitionCrossBranch(req, res, "submit"));
router.post("/:transferId/approve", requirePermission("APPROVE_CROSS_BRANCH_TRANSFER"), (req, res) => transitionCrossBranch(req, res, "approve"));
router.post("/:transferId/dispatch", requirePermission("DISPATCH_CROSS_BRANCH_TRANSFER"), (req, res) => transitionCrossBranch(req, res, "dispatch"));
router.post("/:transferId/receive", requirePermission("RECEIVE_CROSS_BRANCH_TRANSFER"), (req, res) => transitionCrossBranch(req, res, "receive"));
router.post("/:transferId/cancel", requirePermission("CANCEL_CROSS_BRANCH_TRANSFER"), (req, res) => transitionCrossBranch(req, res, "cancel"));
router.post("/:transferId/reverse", requirePermission("REVERSE_CROSS_BRANCH_TRANSFER"), (req, res) => transitionCrossBranch(req, res, "reverse"));

router.post("/", requirePermission("POST_PAYMENT_ACCOUNT_TRANSFER"), async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const fromId = b.from_payment_account_id;
    const toId = b.to_payment_account_id;
    const amount = Number(b.amount);
    const reason = String(b.reason || "").trim();
    const idempotencyKey = String(b.idempotency_key || "").trim();
    const transactionDate = b.transaction_date || new Date().toISOString().slice(0, 10);
    if (!fromId || !toId || fromId === toId) return res.status(400).json({ success: false, message: "From and To accounts must be different." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: "Transfer amount must be greater than zero." });
    if (!reason) return res.status(400).json({ success: false, message: "Transfer reason is required." });
    if (!idempotencyKey) return res.status(400).json({ success: false, message: "idempotency_key is required." });
    await client.query("BEGIN");
    const prior = await client.query("SELECT transfer_id FROM fin.payment_account_transfer WHERE idempotency_key=$1 FOR UPDATE", [idempotencyKey]);
    if (prior.rowCount) { const data = await transferDetails(client, prior.rows[0].transfer_id); await client.query("COMMIT"); return res.json({ success: true, duplicate: true, data }); }
    const ids = [fromId, toId].sort();
    const first = await accountForUpdate(client, ids[0]);
    const second = await accountForUpdate(client, ids[1]);
    const from = ids[0] === fromId ? first : second;
    const to = ids[0] === toId ? first : second;
    if (!from || !to) throw Object.assign(new Error("Both payment accounts must exist."), { statusCode: 404 });
    if (!from.is_active || !to.is_active || !from.is_payment_account || !to.is_payment_account) throw Object.assign(new Error("Both payment accounts must be active payment accounts."), { statusCode: 400 });
    if (from.account_type !== "ASSET" || to.account_type !== "ASSET" || !compatible(from.channel_type, to.channel_type)) throw Object.assign(new Error("This payment-account transfer type is not supported."), { statusCode: 400 });
    const companyId = await getActiveCompanyId();
    const branchResult = await client.query("SELECT default_branch_id FROM app.company_profile WHERE company_id=$1", [companyId]);
    const branchId = req.branchId || branchResult.rows[0]?.default_branch_id || null;
    if (from.branch_id && to.branch_id && from.branch_id !== to.branch_id) throw Object.assign(new Error("Cross-branch payment-account transfers are not supported."), { statusCode: 400 });
    const scopedBranch = to.account_role === "PETTY_CASH" ? to.branch_id : (from.account_role === "PETTY_CASH" ? from.branch_id : null);
    if (scopedBranch && branchId !== scopedBranch) throw Object.assign(new Error("Petty Cash transfers must use the owning branch."), { statusCode: 403 });
    if (scopedBranch && to.account_role === "PETTY_CASH" && from.branch_id && from.branch_id !== scopedBranch) throw Object.assign(new Error("Petty Cash can only be funded from a same-branch source."), { statusCode: 400 });
    const balance = await client.query("SELECT current_balance,available_balance FROM fin.v_payment_account_balance WHERE account_id=$1", [fromId]);
    const available = Number(balance.rows[0]?.available_balance || 0);
    if (!from.allow_negative && available < amount) throw Object.assign(new Error("Source account has insufficient available balance."), { statusCode: 400 });
    if (from.allow_negative && from.overdraft_expiry_date && new Date(from.overdraft_expiry_date) < new Date(transactionDate)) throw Object.assign(new Error("Source account overdraft authorization has expired."), { statusCode: 400 });
    const nextNumber = await client.query("SELECT nextval('fin.payment_account_transfer_no_seq') AS n");
    const number = `PAT-${String(transactionDate).replaceAll("-", "")}-${String(nextNumber.rows[0].n).padStart(6, "0")}`;
    const inserted = await client.query(`
      INSERT INTO fin.payment_account_transfer(transfer_no,company_id,branch_id,source_branch_id,destination_branch_id,transfer_type,transaction_date,from_payment_account_id,to_payment_account_id,amount,reason,reference,status,idempotency_key,created_by)
      VALUES($1,$2,$3,$3,$3,'SAME_BRANCH',$4,$5,$6,$7,$8,$9,'DRAFT',$10,$11) RETURNING transfer_id
    `, [number, companyId, branchId, transactionDate, fromId, toId, amount, reason, b.reference || null, idempotencyKey, req.user.user_id]);
    const transferId = inserted.rows[0].transfer_id;
    await logBusinessEvent(client, { eventCode: "PAYMENT_ACCOUNT_TRANSFER_CREATED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transferId, documentNo: number, companyId, branchId, userId: req.user.user_id, amount, reason, reference: b.reference || null, metadata: { from_account_id: fromId, to_account_id: toId } });
    const journal = await client.query("SELECT fin.create_journal('TRF',$1::date,$2::text,'CASH_TRANSFER',$3::uuid) AS journal_id", [transactionDate, `Transfer ${from.account_code} ${from.account_name} -> ${to.account_code} ${to.account_name} / ${number}`, transferId]);
    const journalId = journal.rows[0].journal_id;
    if (branchId) await client.query("UPDATE fin.gl_journal SET branch_id=$2 WHERE journal_id=$1", [journalId, branchId]);
    await client.query("SELECT fin.add_journal_line($1,$2,NULL,$3,$4,0)", [journalId, toId, `Transfer ${number} destination`, amount]);
    await client.query("SELECT fin.add_journal_line($1,$2,NULL,$3,0,$4)", [journalId, fromId, `Transfer ${number} source`, amount]);
    await client.query("SELECT fin.assert_balanced($1::uuid)", [journalId]);
    await client.query("UPDATE fin.payment_account_transfer SET status='POSTED',journal_id=$2,posted_by=$3,posted_at=now() WHERE transfer_id=$1", [transferId, journalId, req.user.user_id]);
    await logBusinessEvent(client, { eventCode: "PAYMENT_ACCOUNT_TRANSFER_POSTED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transferId, documentNo: number, companyId, branchId, userId: req.user.user_id, amount, journalId, reason, reference: b.reference || null, metadata: { from_account_id: fromId, to_account_id: toId, from_account_code: from.account_code, to_account_code: to.account_code } });
    if (to.account_role === "PETTY_CASH") await logBusinessEvent(client, { eventCode: "PETTY_CASH_FUNDED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transferId, documentNo: number, companyId, branchId: to.branch_id, userId: req.user.user_id, amount, journalId, reason, reference: b.reference || null, metadata: { source_account_id: fromId, destination_account_id: toId, destination_account_code: to.account_code } });
    const data = await transferDetails(client, transferId);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(error.statusCode || 400).json({ success: false, message: error.message || "Payment-account transfer failed." }); }
  finally { client.release(); }
});

router.post("/:transferId/void", requirePermission("VOID_PAYMENT_ACCOUNT_TRANSFER"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM fin.payment_account_transfer WHERE transfer_id=$1 FOR UPDATE", [req.params.transferId]);
    if (!current.rowCount) throw Object.assign(new Error("Transfer not found."), { statusCode: 404 });
    const transfer = current.rows[0];
    if (transfer.status !== "POSTED") throw Object.assign(new Error("Only POSTED transfers can be voided."), { statusCode: 409 });
    const reversal = await client.query("SELECT fin.create_journal('TRF-REV',CURRENT_DATE,$1::text,'CASH_TRANSFER',$2::uuid) AS journal_id", [`Reversal of ${transfer.transfer_no}`, transfer.transfer_id]);
    const journalId = reversal.rows[0].journal_id;
    if (req.branchId) await client.query("UPDATE fin.gl_journal SET branch_id=$2 WHERE journal_id=$1", [journalId, req.branchId]);
    await client.query("SELECT fin.add_journal_line($1,$2,NULL,$3,$4,0)", [journalId, transfer.from_payment_account_id, `Reversal ${transfer.transfer_no} source`, transfer.amount]);
    await client.query("SELECT fin.add_journal_line($1,$2,NULL,$3,0,$4)", [journalId, transfer.to_payment_account_id, `Reversal ${transfer.transfer_no} destination`, transfer.amount]);
    await client.query("SELECT fin.assert_balanced($1::uuid)", [journalId]);
    await client.query("UPDATE fin.payment_account_transfer SET status='VOID',reversed_by=$2,reversed_at=now(),reversal_journal_id=$3,reversal_reason=$4 WHERE transfer_id=$1", [transfer.transfer_id, req.user.user_id, journalId, String(req.body?.reason || "").trim() || "Voided by authorized user"]);
    await logBusinessEvent(client, { eventCode: "PAYMENT_ACCOUNT_TRANSFER_REVERSED", objectType: "PAYMENT_ACCOUNT_TRANSFER", objectId: transfer.transfer_id, documentNo: transfer.transfer_no, companyId: transfer.company_id, branchId: transfer.branch_id, userId: req.user.user_id, amount: transfer.amount, reason: String(req.body?.reason || "").trim() || "Voided by authorized user", journalId, relatedObjectId: transfer.journal_id, metadata: { reversal_journal_id: journalId } });
    const data = await transferDetails(client, transfer.transfer_id);
    await client.query("COMMIT"); res.json({ success: true, data });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(error.statusCode || 400).json({ success: false, message: error.message || "Transfer void failed." }); }
  finally { client.release(); }
});

export default router;
