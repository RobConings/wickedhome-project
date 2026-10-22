import { normalizeBic, normalizeIban, normalizeStructuredCommunication } from "./payment-references";

/**
 * The SEPA credit transfer QR code (EPC069-12, "EPC QR", also called GiroCode): Belgian and other European
 * banking apps scan it and prefill a transfer with beneficiary, IBAN, amount and communication.
 *
 * Payload, one field per line (LF):
 *
 *   BCD                      service tag
 *   002                      version (002: the BIC is optional)
 *   1                        character set: UTF-8
 *   SCT                      SEPA credit transfer
 *   GEBABEBB                 BIC, may be empty
 *   Fluvius                  beneficiary name, at most 70 characters
 *   BE68539007547034         IBAN
 *   EUR123.45                amount, EUR 0.01 – 999 999 999.99
 *                            purpose code (unused)
 *   123456789002             structured creditor reference (the Belgian OGM goes here), at most 35
 *   Invoice 2026-14          or: unstructured remittance information, at most 140 (never both)
 *
 * Trailing empty lines are left out; the whole payload stays under the spec's 331 bytes.
 */
export type PaymentQrInput = {
  beneficiaryName: string | null | undefined;
  iban: string | null | undefined;
  bic?: string | null;
  amountCents: number;
  /** 12 digits, or any accepted notation. */
  structuredCommunication?: string | null;
  /** Free-text communication; ignored when there is a structured one. */
  reference?: string | null;
};

const MAX_NAME = 70;
const MAX_REMITTANCE = 140;
const MAX_AMOUNT_CENTS = 99_999_999_999;

/** `12345` → `EUR123.45`. */
export const epcAmount = (cents: number) => `EUR${(cents / 100).toFixed(2)}`;

/** Removes line breaks (they separate fields) and trims to `max` characters. */
const field = (value: string, max: number) => value.replace(/[\r\n]+/g, " ").trim().slice(0, max);

/**
 * The EPC QR payload, or `null` when a transfer can't be prefilled: no name, an invalid IBAN, or an amount
 * outside the allowed range.
 */
export function epcPayload(input: PaymentQrInput): string | null {
  const name = field(input.beneficiaryName ?? "", MAX_NAME);
  const iban = input.iban ? normalizeIban(input.iban) : null;
  if (!name || !iban) return null;
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > MAX_AMOUNT_CENTS) return null;

  const bic = input.bic ? (normalizeBic(input.bic) ?? "") : "";
  const structured = input.structuredCommunication ? normalizeStructuredCommunication(input.structuredCommunication) : null;
  const remittance = structured ? "" : field(input.reference ?? "", MAX_REMITTANCE);

  const lines = ["BCD", "002", "1", "SCT", bic, name, iban, epcAmount(input.amountCents), "", structured ?? "", remittance];
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
