import assert from "node:assert/strict";
import { it } from "node:test";
import { decodeReceipt, MAX_INLINE_RECEIPT_BYTES } from "./receipt-upload.service";

it("validates an assistant-supplied PDF before creating any document", () => {
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "ascii");
  const encoded = pdf.toString("base64");
  assert.deepEqual(decodeReceipt(encoded, "application/pdf"), pdf);
  assert.deepEqual(decodeReceipt(`data:application/pdf;base64,${encoded}`, "application/pdf"), pdf);
  assert.throws(() => decodeReceipt(encoded, "image/png"), /do not match/);
  assert.throws(() => decodeReceipt(encoded.slice(0, -4), "application/pdf"), /base64/);
  assert.throws(() => decodeReceipt(`data:image/jpeg;base64,${encoded}`, "application/pdf"), /URI type/);
});

it("rejects oversized or malformed inline receipts without storing files", () => {
  assert.throws(
    () => decodeReceipt(Buffer.alloc(MAX_INLINE_RECEIPT_BYTES + 1).toString("base64"), "application/pdf"),
    /larger than 4 MB/,
  );
  assert.throws(() => decodeReceipt("not a base64 string", "application/pdf"), /base64/);
  assert.throws(() => decodeReceipt(Buffer.from("not a pdf").toString("base64"), "application/pdf"), /do not match/);
});
