const MONEY_SCALE = 100n;
const RATE_SCALE = 10000n;
const PERCENT_SCALE = 100n;

function scaled(value, scale) {
  const text = String(value ?? "0").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(`Invalid decimal value: ${value}`);
  const [whole, fraction = ""] = text.split(".");
  const digits = (fraction + "0".repeat(Number(scale === MONEY_SCALE ? 2 : 4))).slice(0, Number(scale === MONEY_SCALE ? 2 : 4));
  return BigInt(whole) * scale + BigInt(digits || "0");
}

function divideRounded(numerator, denominator) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function money(value) {
  const amount = typeof value === "bigint" ? value : scaled(value, MONEY_SCALE);
  return `${amount / MONEY_SCALE}.${String(amount % MONEY_SCALE).padStart(2, "0")}`;
}

export function calculateTaxLine({ amount, rate = 0, treatment = "OUT_OF_SCOPE", pricingMode = "TAX_EXCLUSIVE" }) {
  const input = scaled(amount, MONEY_SCALE);
  const normalizedTreatment = String(treatment).toUpperCase();
  const rateScaled = normalizedTreatment === "STANDARD" ? scaled(rate, RATE_SCALE) : 0n;
  const taxable = ["STANDARD", "ZERO_RATED"].includes(normalizedTreatment);
  if (!taxable || rateScaled === 0n) {
    const gross = input;
    return { taxableAmount: money(pricingMode === "TAX_INCLUSIVE" ? gross : input), taxAmount: "0.00", grossAmount: money(gross), netAmount: money(gross) };
  }
  if (pricingMode === "TAX_INCLUSIVE") {
    const net = divideRounded(input * PERCENT_SCALE * RATE_SCALE, PERCENT_SCALE * RATE_SCALE + rateScaled);
    const tax = input - net;
    return { taxableAmount: money(net), taxAmount: money(tax), grossAmount: money(input), netAmount: money(net) };
  }
  const tax = divideRounded(input * rateScaled, PERCENT_SCALE * RATE_SCALE);
  const gross = input + tax;
  return { taxableAmount: money(input), taxAmount: money(tax), grossAmount: money(gross), netAmount: money(input) };
}

export function calculateDocumentTotals(lines) {
  return lines.reduce((totals, line) => ({
    taxableAmount: money(scaled(totals.taxableAmount, MONEY_SCALE) + scaled(line.taxableAmount, MONEY_SCALE)),
    taxAmount: money(scaled(totals.taxAmount, MONEY_SCALE) + scaled(line.taxAmount, MONEY_SCALE)),
    grossAmount: money(scaled(totals.grossAmount, MONEY_SCALE) + scaled(line.grossAmount, MONEY_SCALE)),
  }), { taxableAmount: "0.00", taxAmount: "0.00", grossAmount: "0.00" });
}

export function taxTreatmentLabel(treatment, rate) {
  const labels = { STANDARD: `Standard Rated — ${rate}%`, ZERO_RATED: "Zero Rated — 0%", EXEMPT: "Exempt", OUT_OF_SCOPE: "Out of Scope" };
  return labels[String(treatment).toUpperCase()] || "Unclassified";
}
