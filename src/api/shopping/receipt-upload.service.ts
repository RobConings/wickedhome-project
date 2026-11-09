import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { SessionUser } from "@/features/auth/types/auth";
import { fileCreateSchema } from "@/features/documents/types/documents";
import type { ReceiptAttachInput, SessionView } from "@/features/shopping/types/sessions";
import { createFile, maxUploadBytes, storeFileContent } from "../documents/documents.service";
import { db } from "../lib/db";
import { badRequest, forbidden, notFound, HttpError } from "../lib/http";
import { attachShoppingReceipt } from "./sessions.service";

export const RECEIPT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

/** Limit inline MCP payloads; the normal web upload supports larger streamed files. */
export const MAX_INLINE_RECEIPT_BYTES = 4_000_000;

export type ReceiptUploadInput = Omit<ReceiptAttachInput, "documentId"> & {
  sessionId: string;
  filename: string;
  mimeType: ReceiptMimeType;
  contentBase64: string;
};

/** Strict decoding avoids accepting truncated/modified evidence as a valid receipt. */
export function decodeReceipt(content: string, mimeType: ReceiptMimeType): Buffer {
  const encoded = content.startsWith("data:")
    ? content.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/)
    : null;
  const value = encoded ? encoded[2]! : content;
  if (content.startsWith("data:") && encoded?.[1] !== mimeType)
    throw badRequest("Receipt data URI type does not match the file type");
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw badRequest("Give the complete base64-encoded receipt bytes");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value)
    throw badRequest("Invalid or non-canonical base64 receipt");
  if (bytes.length > Math.min(MAX_INLINE_RECEIPT_BYTES, maxUploadBytes()))
    throw new HttpError(413, "too_large", "Use the WickedHome file upload for receipts larger than 4 MB");
  const valid = mimeType === "application/pdf"
    ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
    : mimeType === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
        : bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
          bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!valid) throw badRequest("Receipt contents do not match its PDF/image type");
  return bytes;
}

/**
 * One MCP call uploads the actual PDF/image to the household's existing document
 * storage and attaches it to the session. Subsequent retries reuse the same
 * household-owned content hash and receipt: no duplicate financial or stock writes.
 */
export async function uploadShoppingReceipt(user: SessionUser, input: ReceiptUploadInput): Promise<SessionView> {
  if (user.role === "child") throw forbidden("Only adults can upload shopping receipts");
  const session = await db.shoppingSession.findFirst({
    where: { id: input.sessionId, householdId: user.householdId },
    select: { id: true },
  });
  if (!session) throw notFound("Shopping visit not found");
  const bytes = decodeReceipt(input.contentBase64, input.mimeType);
  const meta = fileCreateSchema.parse({
    name: input.filename,
    mimeType: input.mimeType,
    sizeBytes: bytes.length,
    folderId: null,
  });
  const hash = createHash("sha256").update(bytes).digest("hex");
  const prior = await db.documentFile.findFirst({
    where: { householdId: user.householdId, sha256: hash, deletedAt: null, uploadedAt: { not: null } },
    select: { id: true },
  });
  let documentId = prior?.id;
  if (!documentId) {
    const file = await createFile(user, meta);
    await storeFileContent(user.householdId, file.id, Readable.from([bytes]), {
      contentType: input.mimeType,
      contentLength: String(bytes.length),
    });
    documentId = file.id;
  }
  return attachShoppingReceipt(user, input.sessionId, {
    documentId,
    shopId: input.shopId,
    purchasedAt: input.purchasedAt,
    totalCents: input.totalCents,
  });
}
