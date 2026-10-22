/**
 * Unit tests for the address checks of the safe fetch. No network needed for the literal-IP cases. Run on the
 * server:
 *
 *   npx tsx --test src/api/lib/safe-fetch.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnsafeUrlError, assertSafeUrl, isPublicAddress } from "./safe-fetch";

describe("isPublicAddress", () => {
  it("allows public IPv4 and IPv6 addresses", () => {
    // Regression: a shared BlockList matched every IPv4 address against the ::ffff:0:0/96 rule.
    for (const address of ["8.8.8.8", "151.101.11.52", "2a04:4e42:2::820", "2001:4860:4829:7700::"]) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  it("blocks private, loopback, link-local, CGNAT, mapped and NAT64 addresses", () => {
    for (const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.5.4",
      "192.168.0.1",
      "224.0.0.1",
      "::1",
      "::ffff:192.168.0.1",
      "::ffff:8.8.8.8",
      "64:ff9b::a00:1",
      "fc00::1",
      "fe80::1",
      "not-an-ip",
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });
});

describe("assertSafeUrl", () => {
  it("refuses non-http schemes, credentials, odd ports, local names and private literal IPs", async () => {
    for (const url of [
      "ftp://example.com/",
      "file:///etc/passwd",
      "http://user:pass@example.com/",
      "http://example.com:8080/",
      "http://localhost/",
      "http://nas.local/",
      "http://192.168.0.1/",
      "http://[::1]/",
      "not a url",
    ]) {
      await assert.rejects(assertSafeUrl(url), UnsafeUrlError, url);
    }
  });

  it("accepts a public literal IP", async () => {
    assert.equal((await assertSafeUrl("https://8.8.8.8/")).hostname, "8.8.8.8");
  });
});
