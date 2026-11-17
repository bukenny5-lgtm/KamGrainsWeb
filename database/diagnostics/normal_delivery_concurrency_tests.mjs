import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { Client } = createRequire(import.meta.url)("../../backend/node_modules/pg");

const config = { host: "localhost", database: "kam_grains_staging", user: "kam_grains_staging_dev" };
const key = "stock-fulfil:29b9aa55-1ce0-4f7e-8b40-9507ef664215:219a3793-824b-4828-b0bd-ec2c4525520e";

for (const label of ["delivery-vs-stock-transfer", "delivery-vs-POS", "delivery-vs-delivery"]) {
  const first = new Client(config);
  const second = new Client(config);
  await first.connect();
  await second.connect();
  try {
    for (const c of [first, second]) {
      const who = await c.query("SELECT current_database(), current_user");
      assert.deepEqual(who.rows[0], { current_database: "kam_grains_staging", current_user: "kam_grains_staging_dev" });
      await c.query("BEGIN");
    }
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
    const blocked = await second.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired", [key]);
    assert.equal(blocked.rows[0].acquired, false);
    console.log(label, "PASS: shared stock-fulfil lock serialized the competing transaction");
  } finally {
    await first.query("ROLLBACK").catch(() => {});
    await second.query("ROLLBACK").catch(() => {});
    await first.end();
    await second.end();
  }
}
