// Parsing lengths and numbers the way a Belgian plan writes them. Pure functions (unit tested).

/**
 * A number in Belgian or English notation: `12,65` and `12.65` are decimals, `1.200` (a dot followed by
 * exactly three digits, no comma) is twelve hundred, `1.200,50` is twelve hundred and a half. With
 * `dotIsDecimal` a lone dot is always a decimal point (used for metres: "1.200 m" is 1,2 m).
 */
export function parseBelgianNumber(text: string, { dotIsDecimal = false } = {}): number | null {
  const value = text.trim().replace(/\s+/g, "");
  if (!/^[-+]?\d[\d.,]*$/.test(value)) return null;
  let normalized: string;
  if (value.includes(",")) {
    // Comma decimal: dots are thousands separators.
    if (value.indexOf(",") !== value.lastIndexOf(",")) return null;
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (!dotIsDecimal && /^[-+]?\d{1,3}(\.\d{3})+$/.test(value)) {
    normalized = value.replace(/\./g, "");
  } else {
    if (value.indexOf(".") !== value.lastIndexOf(".")) return null;
    normalized = value;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

const UNIT_CM: Record<string, number> = { mm: 0.1, cm: 1, m: 100 };

/**
 * A length typed by the user, in centimetres, or null when it can't be read. Accepts a unit (`12,00 m`,
 * `1200 cm`, `12000 mm`, `3m`). Without a unit, a whole number is centimetres like on the architect's
 * dimension lines (`450`, `1.200`) and a decimal number is metres (`12,00`, `3.5`).
 */
export function parseLengthCm(input: string): number | null {
  const match = /^\s*([-+]?[\d.,\s]*\d)\s*(mm|cm|m)?\s*$/i.exec(input);
  if (!match?.[1]) return null;
  const unit = match[2]?.toLowerCase();
  const raw = match[1];
  let cm: number | null;
  if (unit) {
    const number = parseBelgianNumber(raw, { dotIsDecimal: unit === "m" });
    cm = number === null ? null : number * (UNIT_CM[unit] ?? 1);
  } else {
    const number = parseBelgianNumber(raw);
    if (number === null) return null;
    const decimal = raw.includes(",") || (raw.includes(".") && !/^[-+]?\d{1,3}(\.\d{3})+$/.test(raw.trim()));
    cm = decimal ? number * 100 : number;
  }
  if (cm === null || !(cm > 0)) return null;
  return Math.round(cm * 1000) / 1000;
}
