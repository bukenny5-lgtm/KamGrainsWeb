import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../../database/migrations/phase_42_customer_return_vat_journal_fix.sql", import.meta.url), "utf8");

function expectedJournal({ net, tax, cogs }) {
  const gross = net + tax;
  return {
    debits: net + tax + cogs,
    credits: gross + cogs,
    lines: { sales: net, vat: tax, refund: gross, inventory: cogs, reverseCogs: cogs },
  };
}

test("customer-return VAT snapshots balance across tax treatments", () => {
  const cases = [
    ["full VAT", 250, 45, 100],
    ["partial VAT", 250, 22.5, 100],
    ["zero-rated", 250, 0, 100],
    ["exempt", 250, 0, 100],
    ["POS return with VAT", 250, 45, 100],
  ];
  for (const [name, net, tax, cogs] of cases) {
    const journal = expectedJournal({ net, tax, cogs });
    assert.equal(journal.debits, journal.credits, `${name} journal must balance`);
    assert.equal(journal.lines.refund, net + tax, `${name} must credit gross return value`);
  }
});

test("migration uses immutable return snapshots and one VAT owner", () => {
  assert.match(migration, /v_line\.returned_taxable_amount/);
  assert.match(migration, /v_line\.returned_tax_amount/);
  assert.match(migration, /v_line\.returned_gross_amount/);
  assert.match(migration, /SUM\(l\.returned_gross_amount\)/);
  assert.match(migration, /Output VAT reversal/);
  assert.match(migration, /fin\.assert_balanced\(v_journal_id\)/);
  assert.match(migration, /Never\s*\n\s*-- recalculate tax from the product's current tax configuration/);
});

test("route delegates accounting and keeps rollback protection", () => {
  const route = fs.readFileSync(new URL("../src/routes/customerReturns.routes.js", import.meta.url), "utf8");
  const postBlock = route.slice(route.indexOf('router.post("/:id/post"'), route.indexOf('router.post("/:id/refund"'));
  assert.match(postBlock, /sal\.post_customer_return/);
  assert.doesNotMatch(postBlock, /Output VAT reversal/);
  assert.match(postBlock, /await client\.query\("ROLLBACK"/);
});
