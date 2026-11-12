import assert from "node:assert/strict";
import { it } from "node:test";
import { importCollectAndGoBrowserData } from "./collect-and-go-browser-import";
const entry = (url = "https://www.collectandgo.be/nl/home", status = 200, cookie = "shop-session=private-session") => ({ request: { method: "GET", url, headers: [{ name: "cookie", value: cookie }, { name: "User-Agent", value: "Normal Chrome" }] }, response: { status, content: { mimeType: "text/html", text: "Personal shop page" } } });
const har = (entries: unknown[]) => JSON.stringify({ log: { entries } });
it("imports only host-bound shop cookies and browser metadata, never page contents or Xtra cookies", () => {
  const result = importCollectAndGoBrowserData(har([entry(), entry("https://login.myxtra.be/nl/home", 200, "xtra-login=not-for-the-shop")]));
  assert.equal(result.cookies.length, 1); assert.equal(result.cookies[0]?.domain, "www.collectandgo.be"); assert.equal(result.cookies[0]?.value, "private-session");
  assert.equal(result.userAgent, "Normal Chrome"); assert.deepEqual(result.origins, []);
  assert.ok(!JSON.stringify(result).includes("Personal shop page")); assert.ok(!JSON.stringify(result).includes("not-for-the-shop"));
});
it("rejects sanitized exports, login failures, lookalike origins and blocked pages", () => {
  for (const entries of [[entry(undefined, 200, "")], [entry(undefined, 403)], [entry("https://www.collectandgo.be.attacker.test/nl/home")], [{ ...entry(), response: { status: 200, content: { mimeType: "text/html", text: "vermoeden dat je een bot was" } } }]]) assert.throws(() => importCollectAndGoBrowserData(har(entries)));
});
it("refuses mixed sessions, malformed JSON and header-injection values without echoing secrets", () => {
  for (const text of [har([entry(), entry(undefined, 200, "shop-session=second-private-session")]), "alert('secret')", har([entry(undefined, 200, "shop-session=secret\r\nInjected:yes")])]) {
    try { importCollectAndGoBrowserData(text); assert.fail("accepted invalid export"); } catch (error) { assert.ok(error instanceof Error); assert.ok(!error.message.includes("secret")); }
  }
});
