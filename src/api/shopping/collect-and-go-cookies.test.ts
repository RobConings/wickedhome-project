import assert from "node:assert/strict";
import { it } from "node:test";
import type { CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { collectAndGoRequestCookies, renewCollectAndGoCookies } from "./collect-and-go-cookies";

const url = new URL("https://apip.collectandgo.be/gateway/ecomfoodb2c.eshop.wcscartsvcv2/v2/store/1/cart/@self");
const state = (): CollectAndGoState => ({ cookies: [{ name: "WC_AUTHENTICATION_1", value: "old-auth", domain: url.hostname, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [] });
const headers = (...values: string[]) => { const result = new Headers(); for (const value of values) result.append("Set-Cookie", value); return result; };
const now = Date.parse("2026-11-13T10:00:00Z");

it("keeps separate Set-Cookie headers, expiry commas, scope and server-renewed activity for the next request", () => {
  const saved = state();
  renewCollectAndGoCookies(saved, url, headers(
    "WC_AUTHENTICATION_1=new-auth; Domain=.collectandgo.be; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=Sat, 14 Nov 2026 10:00:00 GMT",
    "WC_USERACTIVITY_1=new-activity; Domain=.collectandgo.be; Path=/; Secure; Max-Age=3600",
    "JSESSIONID=server-session; Path=/; Secure; HttpOnly",
  ), now);
  assert.deepEqual(Object.fromEntries(collectAndGoRequestCookies(saved, url, now).map(c => [c.name, c.value])), { WC_AUTHENTICATION_1: "new-auth", WC_USERACTIVITY_1: "new-activity", JSESSIONID: "server-session" });
  const auth = saved.cookies.find(c => c.name === "WC_AUTHENTICATION_1")!;
  assert.equal(auth.domain, ".collectandgo.be"); assert.equal(auth.expires, now / 1000 + 86400); assert.equal(auth.httpOnly, true); assert.equal(auth.secure, true); assert.equal(auth.sameSite, "Strict");
  assert.equal(saved.cookies.find(c => c.name === "WC_USERACTIVITY_1")?.expires, now / 1000 + 3600);
  assert.equal(collectAndGoRequestCookies(saved, url, now + 86400001).some(c => c.name === "WC_AUTHENTICATION_1"), false);
});

it("honors deletion and Max-Age precedence without reviving the HAR's host-scoped cookie", () => {
  const saved = state();
  renewCollectAndGoCookies(saved, url, headers("WC_AUTHENTICATION_1=deleted; Domain=collectandgo.be; Path=/; Max-Age=0; Expires=Wed, 01 Jan 2031 00:00:00 GMT"), now);
  assert.deepEqual(saved.cookies, []);
  const activity = state();
  renewCollectAndGoCookies(activity, url, headers("WC_USERACTIVITY_1=still-current; Path=/; Max-Age=60; Expires=Wed, 01 Jan 2020 00:00:00 GMT"), now);
  assert.equal(activity.cookies.find(c => c.name === "WC_USERACTIVITY_1")?.expires, now / 1000 + 60);
  renewCollectAndGoCookies(activity, url, headers("WC_USERACTIVITY_1=; Path=/; Expires=Wed, 01 Jan 2020 00:00:00 GMT"), now);
  assert.equal(activity.cookies.some(c => c.name === "WC_USERACTIVITY_1"), false);
});

it("rejects foreign accounts, unrelated cookies, AntiBot tokens, invalid values and invalid scopes", () => {
  const saved = state(), original = structuredClone(saved);
  renewCollectAndGoCookies(saved, url, headers(
    "WC_AUTHENTICATION_2=other-user; Path=/", "WC_USERACTIVITY_2=other-user; Path=/", "tracking=analytics; Path=/", "reese84=challenge-token; Path=/",
    "JSESSIONID=wrong-domain; Domain=www.collectandgo.be; Path=/", "JSESSIONID=public-suffix; Domain=.be; Path=/",
    "JSESSIONID=wrong-path; Path=/elsewhere", "JSESSIONID=relative-path; Path=relative", "JSESSIONID=invalid value; Path=/",
    "JSESSIONID=invalid-expiry; Path=/; Expires=invalid", "JSESSIONID=invalid-age; Path=/; Max-Age=NaN",
  ), now);
  assert.deepEqual(saved, original);
  renewCollectAndGoCookies(saved, new URL("https://attacker.test/"), headers("WC_AUTHENTICATION_1=bad; Path=/"), now);
  assert.deepEqual(saved, original);
});

it("uses RFC path boundaries and default path, with narrow paths before broad cookies", () => {
  const saved = state();
  renewCollectAndGoCookies(saved, url, headers("WC_USERACTIVITY_1=cart-session; Secure", "JSESSIONID=bad-prefix; Path=/gate"), now);
  const activity = saved.cookies.find(c => c.name === "WC_USERACTIVITY_1")!;
  assert.equal(activity.path, "/gateway/ecomfoodb2c.eshop.wcscartsvcv2/v2/store/1/cart");
  assert.equal(collectAndGoRequestCookies(saved, url, now)[0]?.name, "WC_USERACTIVITY_1");
  assert.equal(collectAndGoRequestCookies(saved, new URL("https://apip.collectandgo.be/gateway/ecomfoodb2c.eshop.wcsordersvcv2/v2/store/1/order/@history"), now).some(c => c.name === activity.name), false);
  assert.equal(collectAndGoRequestCookies(saved, new URL("http://apip.collectandgo.be/gateway"), now).length, 0);
});

it("accepts the verified renewal if the old cookie expires while the request is in flight", () => {
  const saved = state(); saved.cookies[0]!.expires = now / 1000 + 1;
  assert.equal(collectAndGoRequestCookies(saved, url, now).length, 1);
  renewCollectAndGoCookies(saved, url, headers("WC_AUTHENTICATION_1=renewed-in-time; Path=/; Secure; Max-Age=3600"), now + 2000);
  assert.equal(collectAndGoRequestCookies(saved, url, now + 2000)[0]?.value, "renewed-in-time");
});
