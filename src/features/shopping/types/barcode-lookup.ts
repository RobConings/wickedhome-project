import { z } from "zod";
import { productCategorySchema } from "./shopping";

/*
 * Barcode auto-fill: the contract between `GET /api/shopping/barcode/:code` and the product form.
 * Everything here is neutral: the UI never learns (or shows) where the data came from.
 */

// Codes --------------------------------------------------------------------------------------------------

/** GTIN check digit of `body` (all digits except the check digit): weights 3,1,3,1… from the right. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    const digit = Number(body[body.length - 1 - index]);
    sum += index % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/** True when the last digit is the right GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}

/** UPC-E (8 digits: number system 0/1, six digits, check digit) → UPC-A (12 digits), or null. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const system = code[0];
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7);
  const check = code[7];
  let body: string;
  if (d6 === "0" || d6 === "1" || d6 === "2") body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const upcA = `${system}${body}${check}`;
  return hasValidCheckDigit(upcA) ? upcA : null;
}

/**
 * The code as it is looked up and cached: EAN-13 (UPC-A gets a leading 0, UPC-E is expanded first, a
 * GTIN-14 with a leading 0 is shortened) or EAN-8. Null when it isn't a product barcode with a valid check
 * digit. Spaces and dashes are ignored. The household's own product keeps the code as scanned.
 */
export function normalizeBarcode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(code)) return null;
  switch (code.length) {
    case 8: {
      if (hasValidCheckDigit(code)) return code;
      const upcA = expandUpcE(code);
      return upcA ? `0${upcA}` : null;
    }
    case 12:
      return hasValidCheckDigit(code) ? `0${code}` : null;
    case 13:
      return hasValidCheckDigit(code) ? code : null;
    case 14:
      return code.startsWith("0") && hasValidCheckDigit(code) ? code.slice(1) : null;
    default:
      return null;
  }
}

/**
 * Codes that only mean something inside one shop: EAN-13 prefixes 020–029 and 200–299 (weighed produce,
 * in-store labels) and EAN-8 starting with 0 or 2. No public database knows them, so they are never looked up.
 */
export function isInStoreCode(normalized: string): boolean {
  if (normalized.length === 8) return normalized[0] === "0" || normalized[0] === "2";
  return normalized[0] === "2" || normalized.startsWith("02");
}

/** A code worth looking up: a valid product barcode that isn't an in-store code. */
export function isLookupBarcode(raw: string): boolean {
  const normalized = normalizeBarcode(raw);
  return normalized !== null && !isInStoreCode(normalized);
}

// Results ------------------------------------------------------------------------------------------------

export const packageQuantitySchema = z.object({
  /** As printed, tidied up for display: "1,5 l", "500 g", "6 x 33 cl". */
  text: z.string(),
  /** Per item: 1.5 for "1,5 l", 33 for "6 x 33 cl". Null when the text couldn't be read. */
  amount: z.number().nullable(),
  /** One of the app's units: "g", "kg", "ml", "cl", "l", "pcs". */
  unit: z.string().nullable(),
  /** Items in a multipack ("6 x 33 cl" → 6), else 1. */
  count: z.number().int().positive(),
});
export type PackageQuantity = z.infer<typeof packageQuantitySchema>;

/** The content of ONE stock package from a printed quantity: "6 x 33 cl" → 198 cl, "200 g" → 200 g; null when unreadable. */
export function packageSizeOf(quantity: PackageQuantity | null | undefined): { amount: number; unit: string } | null {
  if (!quantity?.amount || !quantity.unit) return null;
  return { amount: Math.round(quantity.amount * quantity.count * 1000) / 1000, unit: quantity.unit };
}

/** What a barcode turned out to be, ready to pre-fill a new product. */
export const productSuggestionSchema = z.object({
  /** The normalised code. */
  code: z.string(),
  /** Product name in the best available language. */
  name: z.string(),
  brand: z.string().nullable(),
  /** What kind of thing it is ("Soft drink"), when known. */
  genericName: z.string().nullable(),
  quantity: packageQuantitySchema.nullable(),
  /** The app's own category, when the product's categories map onto one. */
  category: productCategorySchema.nullable(),
  /** Photo, served by the app itself (`/api/shopping/barcode/<code>/image`), or null. */
  imageUrl: z.string().nullable(),
  /** Name for the product form: brand + name + size, e.g. "Coca-Cola Original 1,5 l". */
  productName: z.string(),
});
export type ProductSuggestion = z.infer<typeof productSuggestionSchema>;

export const BARCODE_LOOKUP_STATUSES = ["found", "not_found", "unavailable"] as const;
export type BarcodeLookupStatus = (typeof BARCODE_LOOKUP_STATUSES)[number];

/**
 * `GET /api/shopping/barcode/:code`. `not_found`: no source knows it (or it is an in-store code);
 * `unavailable`: the lookup failed (offline, timeout, too many lookups) — try again later.
 */
export type BarcodeLookupResult = {
  code: string;
  status: BarcodeLookupStatus;
  suggestion: ProductSuggestion | null;
};

/** Where the app serves a looked-up photo; a product may store it as `imageUrl` (see `productImageUrlSchema`). */
export const barcodeImagePath = (normalizedCode: string) => `/api/shopping/barcode/${normalizedCode}/image`;
