import assert from "node:assert/strict";
import { it } from "node:test";
import { importXtraBrowserData, XtraBrowserImportError } from "./xtra-browser-import";

const url = "https://apix.colruyt.be/gateway/emec.colruyt.bffsvc/cg/latest-shopping-list?placeId=1234";
const entry = (overrides: Record<string, unknown> = {}) => ({ request: { method: "GET", url, headers: [{ name: "X-CG-APIKEY", value: "test-key" }, { name: "Cookie", value: "analytics=discard-this; clpbff_session=test-session; reese84=browser-proof==" }, { name: "User-Agent", value: "Normal Chrome" }], ...overrides }, response: { status: 200, content: { text: "PRIVATE LIST CONTENT MUST NOT BE FORWARDED" } } });
const har = (entries: unknown[]) => JSON.stringify({ log: { entries } });
const errorCode = (code: string) => (error: unknown) => error instanceof XtraBrowserImportError && error.code === code;

it("extracts only minimal connection fields from a real-browser request, discarding responses and unrelated cookies", () => {
  const result = importXtraBrowserData(har([entry()]));
  assert.deepEqual(result, { sessionId: "test-session", apiKey: "test-key", placeId: "1234", reese84: "browser-proof==", userAgent: "Normal Chrome" });
  assert.ok(!JSON.stringify(result).includes("PRIVATE LIST")); assert.ok(!JSON.stringify(result).includes("analytics"));
});
it("accepts HAR cookie arrays and product-search requests from the known protected endpoint", () => {
  const value = entry({ url: "https://apip.colruyt.be/gateway/emec.colruyt.protected.bffsvc/cg/nl/api/product-search-prs?placeId=1234", headers: [{ name: "x-cg-apikey", value: "key" }], cookies: [{ name: "clpbff_session", value: "session" }] });
  assert.equal(importXtraBrowserData(har([value])).sessionId, "session");
});
it("explains sanitized exports rather than accepting missing session cookies", () => {
  assert.throws(() => importXtraBrowserData(har([entry({ headers: [{ name: "x-cg-apikey", value: "key" }] })])), errorCode("missingSession"));
});
it("refuses login pages, failed requests, mutations and unrelated lookalike origins", () => {
  for (const request of [{ url: "https://apix.colruyt.be.attacker.test/gateway/emec.colruyt.bffsvc/cg/latest-shopping-list?placeId=1234" }, { url: "http://apix.colruyt.be/gateway/emec.colruyt.bffsvc/cg/latest-shopping-list?placeId=1234" }, { url: url.replace("apix.colruyt.be", "apix.colruyt.be:444") }, { method: "POST" }]) assert.throws(() => importXtraBrowserData(har([entry(request)])), errorCode("noRequest"));
  assert.throws(() => importXtraBrowserData(har([{ ...entry(), response: { status: 403 } }])), errorCode("noRequest"));
});
it("refuses ambiguous account/store exports and accepts repeated entries from the same session", () => {
  assert.equal(importXtraBrowserData(har([entry(), entry()])).placeId, "1234");
  assert.throws(() => importXtraBrowserData(har([entry(), entry({ url: url.replace("1234", "5678") })])), errorCode("multipleSessions"));
});
it("rejects oversized, executable or malformed input without echoing credentials into errors", () => {
  for (const text of ["alert('secret-session')", "x".repeat(2_000_001), har([entry({ headers: [{ name: "x-cg-apikey", value: "private\r\nInjected:yes" }], cookies: [{ name: "clpbff_session", value: "secret-session" }] })])]) {
    try { importXtraBrowserData(text); assert.fail("input was accepted"); }
    catch (error) { assert.ok(error instanceof XtraBrowserImportError); assert.ok(!error.message.includes("secret-session")); }
  }
});
