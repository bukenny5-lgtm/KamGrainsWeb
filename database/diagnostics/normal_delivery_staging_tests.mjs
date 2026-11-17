import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { Client } = createRequire(import.meta.url)("../../backend/node_modules/pg");

const c = new Client({ host: "localhost", database: "kam_grains_staging", user: "kam_grains_staging_dev" });
await c.connect();

async function identity() {
  const r = await c.query("SELECT current_database(), current_user");
  assert.deepEqual(r.rows[0], { current_database: "kam_grains_staging", current_user: "kam_grains_staging_dev" });
}

async function fixture() {
  const r = await c.query(`
    SELECT d.delivery_id, d.delivery_no, d.location_id, dl.delivery_line_id,
           dl.product_id AS original_product_id, tl.product_id, soh.lot_id, soh.qty_on_hand, t.stock_transfer_id,
           tl.stock_transfer_line_id, tl.qty AS transfer_qty
    FROM sal.delivery d
    JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
    JOIN inv.stock_transfer t ON t.source_location_id = d.location_id AND t.status = 'IN_TRANSIT'
    JOIN inv.stock_transfer_line tl ON tl.stock_transfer_id = t.stock_transfer_id
    JOIN inv.v_stock_on_hand soh ON soh.product_id = tl.product_id AND soh.location_id = d.location_id
      AND soh.lot_id IS NOT DISTINCT FROM tl.lot_id
    JOIN inv.lot l ON l.lot_id = soh.lot_id AND l.lot_status = 'ACTIVE'
    WHERE NOT d.is_posted AND soh.qty_on_hand > 0
    ORDER BY soh.qty_on_hand DESC
    LIMIT 1`);
  assert.equal(r.rowCount, 1, "staging fixture with unposted delivery and active stock lot is required");
  return r.rows[0];
}

async function deliveryState(id) {
  return (await c.query(`SELECT is_posted, posted_movement_id, posted_journal_id FROM sal.delivery WHERE delivery_id=$1`, [id])).rows[0];
}

async function movementCount(no) {
  return Number((await c.query(`SELECT count(*)::int AS n FROM inv.stock_movement WHERE document_no=$1`, [no])).rows[0].n);
}

async function callExpectError(sql, params, pattern) {
  await c.query("SAVEPOINT expected_failure");
  try {
    await c.query(sql, params);
    assert.fail(`Expected database error matching ${pattern}`);
  } catch (error) {
    await c.query("ROLLBACK TO SAVEPOINT expected_failure");
    assert.match(error.message, pattern);
  }
}

await identity();
const f = await fixture();
console.log("fixture", JSON.stringify(f));

// Direct SQL success and rollback proof.
await identity();
await c.query("BEGIN");
try {
  await c.query(`UPDATE sal.delivery SET location_id=$2 WHERE delivery_id=$1`, [f.delivery_id, f.location_id]);
  await c.query(`UPDATE sal.delivery_line SET product_id=$2, lot_id=$3, qty=0.100 WHERE delivery_line_id=$1`, [f.delivery_line_id, f.product_id, f.lot_id]);
  const before = await movementCount(f.delivery_no);
  const result = await c.query("SELECT sal.post_delivery($1) AS movement_id", [f.delivery_id]);
  assert.ok(result.rows[0].movement_id);
  const state = await deliveryState(f.delivery_id);
  assert.equal(state.is_posted, true);
  assert.ok(state.posted_movement_id);
  assert.ok(state.posted_journal_id);
  assert.equal(await movementCount(f.delivery_no), before + 1);
  console.log("direct_success_and_accounting", "PASS");
} finally {
  await c.query("ROLLBACK");
}

// Direct SQL reservation conflict and no partial mutation.
await identity();
await c.query("BEGIN");
try {
  await c.query(`UPDATE sal.delivery SET location_id=$2 WHERE delivery_id=$1`, [f.delivery_id, f.location_id]);
  await c.query(`UPDATE sal.delivery_line SET product_id=$2, lot_id=$3, qty=0.100 WHERE delivery_line_id=$1`, [f.delivery_line_id, f.product_id, f.lot_id]);
  if (f.stock_transfer_id) {
    await c.query(`UPDATE inv.stock_transfer SET status='DRAFT' WHERE stock_transfer_id=$1`, [f.stock_transfer_id]);
    await c.query(`UPDATE inv.stock_transfer_line SET qty=999 WHERE stock_transfer_line_id=$1`, [f.stock_transfer_line_id]);
  }
  const before = await movementCount(f.delivery_no);
  await callExpectError("SELECT sal.post_delivery($1)", [f.delivery_id], /Insufficient stock/);
  assert.equal(await movementCount(f.delivery_no), before);
  assert.deepEqual(await deliveryState(f.delivery_id), { is_posted: false, posted_movement_id: null, posted_journal_id: null });
  console.log("direct_reservation_conflict_atomicity", "PASS");
} finally {
  await c.query("ROLLBACK");
}

// Selected-lot shortage, cancelled, and already-posted guards.
await identity();
await c.query("BEGIN");
try {
  await c.query(`UPDATE sal.delivery_line SET product_id=$2, lot_id=$3, qty=$4 WHERE delivery_line_id=$1`, [f.delivery_line_id, f.product_id, f.lot_id, Number(f.qty_on_hand) + 1]);
  await callExpectError("SELECT sal.post_delivery($1)", [f.delivery_id], /Insufficient stock/);
  await c.query(`UPDATE sal.delivery SET status='CANCELLED' WHERE delivery_id=$1`, [f.delivery_id]);
  await callExpectError("SELECT sal.post_delivery($1)", [f.delivery_id], /cancelled delivery/);
  const posted = (await c.query(`SELECT delivery_id FROM sal.delivery WHERE is_posted ORDER BY created_at DESC LIMIT 1`)).rows[0];
  await callExpectError("SELECT sal.post_delivery($1)", [posted.delivery_id], /already posted/);
  console.log("selected_lot_cancelled_already_posted_guards", "PASS");
} finally {
  await c.query("ROLLBACK");
}

// Wrapper direct SQL path delegates to the guarded function.
await identity();
await c.query("BEGIN");
try {
  await c.query(`UPDATE sal.delivery_line SET product_id=$2, lot_id=$3, qty=0.100 WHERE delivery_line_id=$1`, [f.delivery_line_id, f.product_id, f.lot_id]);
  const result = await c.query("SELECT sal.post_delivery_by_no($1) AS movement_id", [f.delivery_no]);
  assert.ok(result.rows[0].movement_id);
  console.log("wrapper_direct_sql_guarded_path", "PASS");
} finally {
  await c.query("ROLLBACK");
}

await c.end();
console.log("staging_normal_delivery_tests", "PASS");
