import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/pos.routes.js", import.meta.url), "utf8");
const transfers = fs.readFileSync(new URL("../src/routes/stockTransfers.routes.js", import.meta.url), "utf8");
const requests = fs.readFileSync(new URL("../src/routes/internalStockRequests.routes.js", import.meta.url), "utf8");
const deliveries = fs.readFileSync(new URL("../src/routes/deliveries.routes.js", import.meta.url), "utf8");
const adjustments = fs.readFileSync(new URL("../src/routes/stockAdjustments.routes.js", import.meta.url), "utf8");
const returns = fs.readFileSync(new URL("../src/routes/customerReturns.routes.js", import.meta.url), "utf8");
const goodsReceipts = fs.readFileSync(new URL("../src/controllers/goodsReceipts.controller.js", import.meta.url), "utf8");
const lockHelper = fs.readFileSync(new URL("../src/services/stockLock.service.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_62_pos_location_stock_enforcement.sql", import.meta.url), "utf8");

test("POS sale sessions require an active till tied to the sale location", () => {
  assert.match(route, /JOIN app\.till t ON t\.till_id=s\.till_id/);
  assert.match(route, /t\.location_id=s\.location_id/);
  assert.match(route, /JOIN sec\.user_till ut ON ut\.till_id=s\.till_id/);
  assert.match(route, /ut\.user_id=s\.cashier_user_id AND ut\.is_active/);
});

test("POS location guard validates local stock and preserves the selected lot", () => {
  assert.match(migration, /ALTER FUNCTION sal\.post_pos_sale\(uuid\) RENAME TO post_pos_sale_unscoped/);
  assert.match(migration, /sml\.lot_id IS NOT DISTINCT FROM v_line\.lot_id/);
  assert.match(migration, /sml\.to_location_id = v_sale\.location_id/);
  assert.match(migration, /sml\.from_location_id = v_sale\.location_id/);
  assert.match(migration, /t\.source_location_id = v_sale\.location_id/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(migration, /RETURN sal\.post_pos_sale_unscoped\(p_pos_sale_id\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION sal\.post_pos_sale_unscoped\(uuid\) FROM PUBLIC/);
  assert.match(migration, /kam_grains_pos_fn_owner/);
  assert.match(migration, /kam_grains\.application_role/);
  assert.match(migration, /v_owner\.rolcanlogin OR v_owner\.rolsuper/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION sal\.post_pos_sale_unscoped\(uuid\) TO postgres/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, public/);
  assert.match(migration, /REVOKE ALL ON FUNCTION sal\.post_pos_sale\(uuid\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION sal\.post_pos_sale\(uuid\) TO %I/);
  assert.equal((migration.match(/RETURN sal\.post_pos_sale_unscoped\(p_pos_sale_id\)/g) || []).length, 1);
});

test("stock transfer reservations use the same location/product lock", () => {
  assert.match(transfers, /lockStockItems\(c, lines\.map/);
  assert.match(transfers, /t\.source_location_id=soh\.location_id/);
  assert.match(transfers, /t\.status IN \('DRAFT','PARTIALLY_DISPATCHED'\)/);
  assert.match(requests, /ORDER BY product_id,request_line_id/);
  assert.match(requests, /lockStockItems\(c, lockLines\.rows\.map/);
});

test("stock-affecting route entrypoints use the shared transaction lock helper", () => {
  assert.match(deliveries, /sal\.post_delivery_by_no/);
  assert.match(adjustments, /inv\.post_damage_adjustment_by_no/);
  assert.match(returns, /sal\.post_customer_return/);
  assert.match(deliveries, /lockStockItems\(client, lines\.rows\)/);
  assert.match(adjustments, /lockStockItems\(client, lockLines\.rows\)/);
  assert.match(returns, /lockStockItems\(client, lockLines\.rows\)/);
  assert.match(goodsReceipts, /lockStockItems\(client, lines\.rows\)/);
  assert.match(lockHelper, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(lockHelper, /sort\(\(\[left\], \[right\]\)/);
  assert.match(route, /lockStockItems\(client, lockItems\)/);
  assert.match(returns, /lockStockItems\(client, lockItems\)/);
});
