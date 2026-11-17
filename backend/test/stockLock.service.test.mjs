import test from "node:test";
import assert from "node:assert/strict";
import { assertTransactionClient, lockStockItems, stockLockKey } from "../src/services/stockLock.service.js";

const locationA = "11111111-1111-4111-8111-111111111111";
const locationB = "22222222-2222-4222-8222-222222222222";
const productA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockClient({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    release() {},
    async query(sql, params) {
      calls.push({ sql, params });
      if (fail) throw new Error("lock failed");
      return { rows: [] };
    }
  };
}

test("stock lock keys validate UUIDs and preserve the shared namespace", () => {
  assert.equal(stockLockKey(locationA, productA), `stock-fulfil:${locationA}:${productA}`);
  assert.equal(stockLockKey(locationA.toUpperCase(), productA.toUpperCase()), `stock-fulfil:${locationA}:${productA}`);
  assert.throws(() => stockLockKey("location-a", productA), /valid location_id/);
  assert.throws(() => stockLockKey(locationA, "product-a"), /valid product_id/);
});

test("stock locks reject pool/query wrappers and deduplicate in deterministic order", async () => {
  assert.throws(() => assertTransactionClient({ query() {} }), /dedicated client/);
  const client = mockClient();
  await lockStockItems(client, [
    { location_id: locationB, product_id: productB },
    { location_id: locationA, product_id: productA },
    { location_id: locationA, product_id: productA },
    { location_id: locationA.toUpperCase(), product_id: productA.toUpperCase() }
  ]);
  assert.equal(client.calls.length, 2);
  assert.deepEqual(client.calls.map((call) => call.params[0]), [
    `stock-fulfil:${locationA}:${productA}`,
    `stock-fulfil:${locationB}:${productB}`
  ]);
});

test("stock lock errors propagate through the same transaction client", async () => {
  const client = mockClient({ fail: true });
  await assert.rejects(
    lockStockItems(client, [{ location_id: locationA, product_id: productA }]),
    /lock failed/
  );
});

test("a mocked transaction keeps lock, check, mutation and completion on one client", async () => {
  const client = mockClient();
  await client.query("BEGIN");
  await lockStockItems(client, [{ location_id: locationA, product_id: productA }]);
  await client.query("SELECT availability");
  await client.query("SELECT mutate");
  await client.query("COMMIT");
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
    "SELECT availability",
    "SELECT mutate",
    "COMMIT"
  ]);
});
