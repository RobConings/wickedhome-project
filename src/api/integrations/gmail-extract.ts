import { normalizeIban, normalizeStructuredCommunication } from "@/features/expenses/types/payment-references";
import { addDays, daysBetween } from "@/types/dates";

/*
 * Reading a bill out of a mail: pure functions (unit-tested in google.test.ts). Belgian invoices in Dutch,
 * French or English: amounts like "€ 1.234,56", "1.234,56 EUR", "EUR 89,90" or "€89.90", the structured
 * communication +++123/4567/89002+++ (mod-97 checked), an IBAN (mod-97 checked) and a due date.
 * Every field is optional: the person checks and completes it in the expense form.
 */

export type ExtractedBill = {
  amountCents: number | null;
  dueDate: string | null;
  structuredCommunication: string | null;
  iban: string | null;
};

// ── Amounts ──────────────────────────────────────────────────────────────────────────────────────────

/** `1.234,56` / `1234,56` / `1,234.56` / `1234.56` / `12,5` / `1.234` → cents; `null` when it isn't an amount. */
export function parseAmountToCents(raw: string): number | null {
  // `\s` also covers the no-break and narrow no-break spaces banks put inside amounts.
  const value = raw.replace(/[\s']/g, "");
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);
  let whole = value;
  let fraction = "";
  if (decimalAt >= 0) {
    const after = value.slice(decimalAt + 1);
    const separator = value[decimalAt];
    const otherSeparatorUsed = separator === "," ? lastDot >= 0 : lastComma >= 0;
    // "1.234" or "12.345.678" (one kind of separator, groups of three): thousands, no decimals.
    const thousandsOnly = !otherSeparatorUsed && after.length === 3 && (separator === "." || value.split(",").length > 2);
    if (!thousandsOnly && after.length >= 1 && after.length <= 2) {
      whole = value.slice(0, decimalAt);
      fraction = after;
    } else if (!thousandsOnly) {
      return null;
    }
  }
  const digits = whole.replace(/[.,]/g, "");
  if (!/^\d{1,9}$/.test(digits)) return null;
  return Number(digits) * 100 + Number(fraction.padEnd(2, "0") || "0");
}

// Grouped thousands ("1.234,56", "1 234,56") or plain ("1234,56", "89.90"); never stops inside a number.
const NUMBER = String.raw`(?:\d{1,3}(?:[.\s']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d.,]\d)`;
const MONEY = new RegExp(String.raw`(?:€|EUR|EURO)\s*(${NUMBER})|(${NUMBER})\s*(?:€|EUR\b|EURO\b)`, "gi");

/**
 * Words right before the amount to pay (NL, FR, EN). `PAY_KEYWORDS` say it is what to pay (or the total with
 * VAT); `TOTAL_KEYWORDS` are any total or amount, which on an invoice may also be the subtotal without VAT.
 */
const PAY_KEYWORDS =
  /(totaal te betalen|te betalen bedrag|te betalen|openstaand saldo|totaal incl(?:usief|\.)?(?: btw)?|incl(?:usief|\.)? btw|tvac|tva comprise|total à payer|à payer|a payer|amount due|total due|balance due|total incl(?:uding|\.)?(?: vat)?)/gi;
const TOTAL_KEYWORDS = /(totaalbedrag|totaal|montant total|montant|total amount|total|bedrag|amount)/gi;
/** Right after a total keyword: it is the amount without VAT (or a part), not what to pay. */
const WITHOUT_VAT = /^[\s:.-]*(excl|exclusief|zonder btw|htva|hors tva|excl\.|excluding|ex\.? vat|net|netto|btw|tva|vat)\b/i;

export function moneyTokens(text: string): { index: number; cents: number }[] {
  const tokens: { index: number; cents: number }[] = [];
  for (const match of text.matchAll(MONEY)) {
    const cents = parseAmountToCents(match[1] ?? match[2] ?? "");
    if (cents !== null && cents > 0 && cents < 100_000_00) tokens.push({ index: match.index ?? 0, cents });
  }
  return tokens;
}

/** The money token shortly after the keyword match (on the same line or just below), or undefined. */
function amountAfter(tokens: { index: number; cents: number }[], at: number) {
  return tokens.find((token) => token.index >= at - 2 && token.index - at <= 80);
}

/**
 * The amount to pay. First the amount after a "to pay / incl. VAT" keyword. Else the totals, without the ones
 * marked "excl. VAT / subtotal": the largest of them (an invoice's total with VAT is always its largest total).
 * Else the first money amount.
 */
export function findAmount(text: string): number | null {
  const tokens = moneyTokens(text);
  if (tokens.length === 0) return null;
  for (const keyword of text.matchAll(PAY_KEYWORDS)) {
    const next = amountAfter(tokens, (keyword.index ?? 0) + keyword[0].length);
    if (next) return next.cents;
  }
  const totals: number[] = [];
  for (const keyword of text.matchAll(TOTAL_KEYWORDS)) {
    const start = keyword.index ?? 0;
    const at = start + keyword[0].length;
    if (/sub\s*-?$/i.test(text.slice(Math.max(0, start - 4), start)) || WITHOUT_VAT.test(text.slice(at, at + 30))) continue;
    const next = amountAfter(tokens, at);
    if (next) totals.push(next.cents);
  }
  if (totals.length) return Math.max(...totals);
  return tokens[0]?.cents ?? null;
}

// ── Payment references ───────────────────────────────────────────────────────────────────────────────

/** The first valid structured communication (+++123/4567/89002+++, ***…***, or 123/4567/89002). */
export function findStructuredCommunication(text: string): string | null {
  for (const match of text.matchAll(/(?:\+{3}|\*{3})?\s*(\d{3})\s*\/\s*(\d{4})\s*\/\s*(\d{5})\s*(?:\+{3}|\*{3})?/g)) {
    const digits = normalizeStructuredCommunication(`${match[1]}${match[2]}${match[3]}`);
    if (digits) return digits;
  }
  return null;
}

/** The first valid IBAN (Belgian ones first). */
export function findIban(text: string): string | null {
  const found: string[] = [];
  for (const match of text.toUpperCase().matchAll(/\b([A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?)\b/g)) {
    // The match can run into the next word ("… 7034 BIC GKCC…"): try it shorter until a valid IBAN remains.
    const compact = (match[1] ?? "").replace(/ /g, "");
    for (let length = compact.length; length >= 15; length--) {
      const iban = normalizeIban(compact.slice(0, length));
      if (iban) {
        found.push(iban);
        break;
      }
    }
  }
  return found.find((iban) => iban.startsWith("BE")) ?? found[0] ?? null;
}

// ── Due dates ────────────────────────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, janvier: 1, jan: 1,
  februari: 2, february: 2, février: 2, fevrier: 2, feb: 2, fév: 2,
  maart: 3, march: 3, mars: 3, mrt: 3, mar: 3,
  april: 4, avril: 4, apr: 4, avr: 4,
  mei: 5, may: 5, mai: 5,
  juni: 6, june: 6, juin: 6, jun: 6,
  juli: 7, july: 7, juillet: 7, jul: 7,
  augustus: 8, august: 8, août: 8, aout: 8, aug: 8,
  september: 9, septembre: 9, sep: 9, sept: 9,
  oktober: 10, october: 10, octobre: 10, okt: 10, oct: 10,
  november: 11, novembre: 11, nov: 11,
  december: 12, décembre: 12, decembre: 12, dec: 12, déc: 12,
};

const iso = (year: number, month: number, day: number): string | null => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? date.toISOString().slice(0, 10) : null;
};

const fullYear = (year: string) => (year.length === 2 ? 2000 + Number(year) : Number(year));

/** Dates in a text, in order: dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy, "15 oktober 2026", "October 15, 2026", 2026-10-15. */
export function findDates(text: string): { index: number; date: string }[] {
  const dates: { index: number; date: string }[] = [];
  const push = (index: number, date: string | null) => date && dates.push({ index, date });
  for (const match of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) {
    push(match.index ?? 0, iso(fullYear(match[3] ?? ""), Number(match[2]), Number(match[1])));
  }
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(match.index ?? 0, iso(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  for (const match of text.matchAll(/\b(\d{1,2})(?:e|er|st|nd|rd|th)?\s+([a-zéû]{3,10})\.?\s+(\d{4})\b/gi)) {
    const month = MONTHS[(match[2] ?? "").toLowerCase()];
    if (month) push(match.index ?? 0, iso(Number(match[3]), month, Number(match[1])));
  }
  for (const match of text.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
    const month = MONTHS[(match[1] ?? "").toLowerCase()];
    if (month) push(match.index ?? 0, iso(Number(match[3]), month, Number(match[2])));
  }
  return dates.sort((a, b) => a.index - b.index);
}

const DUE_KEYWORDS =
  /(vervaldag|vervaldatum|uiterste betaaldatum|te betalen (?:voor|vóór|tegen|uiterlijk op)|betalen (?:voor|vóór)|uiterlijk (?:op|tegen)|wordt gedomicilieerd op|domiciliëring op|date d'échéance|échéance|echeance|à payer avant|a payer avant|payable (?:avant|before|by)|due date|due on|pay by|payment due)/gi;

/** The date shortly after a due-date keyword, if it is plausible (from 30 days before receipt to a year after). */
export function findDueDate(text: string, receivedOn: string): string | null {
  const dates = findDates(text);
  for (const keyword of text.matchAll(DUE_KEYWORDS)) {
    const at = (keyword.index ?? 0) + keyword[0].length;
    const next = dates.find((entry) => entry.index >= at && entry.index - at <= 60);
    if (next && daysBetween(addDays(receivedOn, -30), next.date) >= 0 && daysBetween(next.date, addDays(receivedOn, 366)) >= 0) {
      return next.date;
    }
  }
  return null;
}

/** Reads every field from the texts in order (the scan passes PDF, body, subject): the first text that has a field wins. */
export function extractBill(texts: string[], receivedOn: string): ExtractedBill {
  const first = <T>(find: (text: string) => T | null): T | null => {
    for (const text of texts) {
      const value = find(text);
      if (value !== null) return value;
    }
    return null;
  };
  return {
    amountCents: first(findAmount),
    dueDate: first((text) => findDueDate(text, receivedOn)),
    structuredCommunication: first(findStructuredCommunication),
    iban: first(findIban),
  };
}

// ── Senders and de-duplication ───────────────────────────────────────────────────────────────────────

/** `"Fluvius" <NoReply@Fluvius.be>` → `noreply@fluvius.be`. */
export function senderAddress(fromHeader: string): string | null {
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(fromHeader) ?? /([^\s<>"]+@[^\s<>"]+)/.exec(fromHeader);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Whether an address matches a sender pattern: a full address, or a domain (also its subdomains). */
export function senderMatches(address: string, pattern: string): boolean {
  const wanted = pattern.toLowerCase();
  if (wanted.includes("@")) return address === wanted;
  const domain = address.split("@")[1] ?? "";
  return domain === wanted || domain.endsWith(`.${wanted}`);
}

export function matchRule<R extends { senders: string[]; enabled: boolean }>(address: string, rules: R[]): R | null {
  return rules.find((rule) => rule.enabled && rule.senders.some((pattern) => senderMatches(address, pattern))) ?? null;
}

/** The Gmail search for bills from these senders, with a PDF, received after `after` (seconds since epoch). */
export function gmailQuery(senders: string[], afterEpochSeconds: number): string {
  return `from:(${[...new Set(senders)].join(" OR ")}) has:attachment filename:pdf after:${Math.floor(afterEpochSeconds)}`;
}

/**
 * The same bill must give one suggestion per household (mailed twice, or to both partners): by its
 * structured communication; else by payee + amount + due date; else by message.
 */
export function dedupeKey(input: { payee: string; amountCents: number | null; dueDate: string | null; structuredCommunication: string | null; messageId: string }): string {
  if (input.structuredCommunication) return `ogm:${input.structuredCommunication}`;
  if (input.amountCents !== null) return `amount:${input.payee.trim().toLowerCase()}:${input.amountCents}:${input.dueDate ?? ""}`;
  return `message:${input.messageId}`;
}
