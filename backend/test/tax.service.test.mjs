import test from "node:test";
import assert from "node:assert/strict";
import { calculateDocumentTotals, calculateTaxLine } from "../src/services/tax.service.js";

test("exclusive standard VAT", () => assert.deepEqual(calculateTaxLine({ amount: "100000", rate: "18", treatment: "STANDARD", pricingMode: "TAX_EXCLUSIVE" }), { taxableAmount: "100000.00", taxAmount: "18000.00", grossAmount: "118000.00", netAmount: "100000.00" }));
test("inclusive standard VAT", () => assert.deepEqual(calculateTaxLine({ amount: "118000", rate: "18", treatment: "STANDARD", pricingMode: "TAX_INCLUSIVE" }), { taxableAmount: "100000.00", taxAmount: "18000.00", grossAmount: "118000.00", netAmount: "100000.00" }));
test("generic configured rate is not hardcoded to Uganda 18%", () => assert.deepEqual(calculateTaxLine({ amount: "100000", rate: "10", treatment: "STANDARD" }), { taxableAmount: "100000.00", taxAmount: "10000.00", grossAmount: "110000.00", netAmount: "100000.00" }));
test("zero rated, exempt, and out of scope are distinct treatments", () => {
  assert.equal(calculateTaxLine({ amount: "100", rate: "18", treatment: "ZERO_RATED" }).taxAmount, "0.00");
  assert.equal(calculateTaxLine({ amount: "100", rate: "18", treatment: "EXEMPT" }).taxAmount, "0.00");
  assert.equal(calculateTaxLine({ amount: "100", rate: "18", treatment: "OUT_OF_SCOPE" }).taxAmount, "0.00");
});
test("document totals reconcile line-level rounding", () => assert.deepEqual(calculateDocumentTotals([
  calculateTaxLine({ amount: "0.01", rate: "18", treatment: "STANDARD" }),
  calculateTaxLine({ amount: "100000", rate: "18", treatment: "STANDARD" }),
]), { taxableAmount: "100000.01", taxAmount: "18000.00", grossAmount: "118000.01" }));
test("mixed tax basket and discounted taxable base", () => {
  const lines = [
    calculateTaxLine({ amount: "90000", rate: "18", treatment: "STANDARD" }),
    calculateTaxLine({ amount: "25000", rate: "18", treatment: "ZERO_RATED" }),
    calculateTaxLine({ amount: "15000", rate: "18", treatment: "EXEMPT" }),
  ];
  assert.deepEqual(calculateDocumentTotals(lines), { taxableAmount: "130000.00", taxAmount: "16200.00", grossAmount: "146200.00" });
});
test("VAT disabled/unclassified amount remains unchanged", () => assert.deepEqual(calculateTaxLine({ amount: "100000", rate: "18", treatment: "OUT_OF_SCOPE" }), { taxableAmount: "100000.00", taxAmount: "0.00", grossAmount: "100000.00", netAmount: "100000.00" }));
