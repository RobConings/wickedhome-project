/**
 * Belgian payment references: the structured communication ("gestructureerde mededeling", OGM/VCS), IBAN,
 * BIC and free-text communications. Pure functions, shared by the form (instant feedback), the API (the real
 * check), the payment QR and the subscription migration.
 */

/**
 * Normalises a Belgian structured communication to its 12 digits. Accepts `+++123/4567/89002+++`,
 * `***123/4567/89002***`, `123/4567/89002`, `123456789002` and variants with spaces. Returns `null` when
 * it isn't 12 digits or the check digits are wrong.
 *
 * The check: the first 10 digits modulo 97 must equal the last 2 digits, where a remainder of 0 is
 * written as 97.
 */
export function normalizeStructuredCommunication(input: string): string | null {
  const trimmed = input.trim();
  const inner = trimmed.replace(/^(\+{3}|\*{3})/, "").replace(/(\+{3}|\*{3})$/, "");
  if (!/^[\d\s/]+$/.test(inner)) return null;
  const digits = inner.replace(/[\s/]/g, "");
  if (!/^\d{12}$/.test(digits)) return null;
  return structuredCommunicationCheck(digits.slice(0, 10)) === digits.slice(10) ? digits : null;
}

export const isValidStructuredCommunication = (input: string) => normalizeStructuredCommunication(input) !== null;

/** The two check digits for a 10-digit base number. */
export function structuredCommunicationCheck(base: string): string {
  const remainder = Number(BigInt(base) % 97n);
  return String(remainder === 0 ? 97 : remainder).padStart(2, "0");
}

/** `123456789002` → `+++123/4567/89002+++`. Leaves anything that isn't 12 digits untouched. */
export function formatStructuredCommunication(digits: string): string {
  if (!/^\d{12}$/.test(digits)) return digits;
  return `+++${digits.slice(0, 3)}/${digits.slice(3, 7)}/${digits.slice(7)}+++`;
}

/**
 * Whether text was meant as a structured communication (wrapped in +++/***, or 3/4/5 digits with slashes),
 * so a typo in one is reported instead of being saved as free text.
 */
export function looksLikeStructuredCommunication(input: string): boolean {
  const trimmed = input.trim();
  return /^(\+{3}|\*{3})/.test(trimmed) || /^\d{3}\s*\/\s*\d{4}\s*\/\s*\d{5}$/.test(trimmed);
}

/** Expected IBAN length per country, for the countries a Belgian household realistically pays to. */
const IBAN_LENGTHS: Record<string, number> = {
  BE: 16,
  NL: 18,
  LU: 20,
  FR: 27,
  DE: 22,
  GB: 22,
  IE: 22,
  ES: 24,
  IT: 27,
  PT: 25,
  AT: 20,
  CH: 21,
};

/**
 * Normalises an IBAN to upper case without spaces and validates it (ISO 13616: country code, check
 * digits, mod-97 = 1, and the country's length when known). Returns `null` when invalid.
 */
export function normalizeIban(input: string): string | null {
  const iban = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return null;

  // Move the first four characters to the end and turn letters into numbers (A = 10 … Z = 35).
  const numeric = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  return BigInt(numeric) % 97n === 1n ? iban : null;
}

export const isValidIban = (input: string) => normalizeIban(input) !== null;

/** `BE68539007547034` → `BE68 5390 0754 7034` (groups of four, as Belgian banks print it). */
export const formatIban = (iban: string) => iban.replace(/\s/g, "").replace(/(.{4})(?=.)/g, "$1 ");

/**
 * Normalises a BIC (SWIFT code) to upper case without spaces: 4 letters (bank), 2 letters (country),
 * 2 letters/digits (location) and an optional 3-character branch. Returns `null` when invalid.
 */
export function normalizeBic(input: string): string | null {
  const bic = input.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) ? bic : null;
}

/** Longest free-text communication: what fits in a SEPA transfer's remittance information. */
export const MAX_REFERENCE_LENGTH = 140;
