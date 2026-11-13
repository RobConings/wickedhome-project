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

it("extracts native cart credentials from a successful cart HAR, never replaying POST bodies or importing analytics", () => {
  const request = { method: "POST", url: "https://apip.collectandgo.be/gateway/ecomfoodb2c.eshop.wcscartsvcv2/v2/store/1/cart?langId=-11&catalogId=2", headers: [{ name: "WCAuthToken", value: "fixture-token" }, { name: "X-CG-APIKey", value: "fixture-key" }, { name: "Cookie", value: "WC_AUTHENTICATION_1=fixture-cookie; analytics=discard" }], postData: { text: "PRIVATE WRITE BODY" } };
  const result = importCollectAndGoBrowserData(har([{ request, response: { status: 201, content: { mimeType: "application/json" } } }]));
  assert.equal(result.cartApi?.authToken,"fixture-token"); assert.equal(result.cartApi?.storeId,"1");assert.equal(result.cookies.length,1);assert.equal(result.cookies[0]?.domain,"apip.collectandgo.be");assert.ok(!JSON.stringify(result).includes("PRIVATE WRITE BODY"));assert.ok(!JSON.stringify(result).includes("analytics"));
  const guest={...request,headers:request.headers.filter(h=>h.name!=="Cookie")};assert.throws(()=>importCollectAndGoBrowserData(har([{request:guest,response:{status:201,content:{mimeType:"application/json"}}}])));
});
