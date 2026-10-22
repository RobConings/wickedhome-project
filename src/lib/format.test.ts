import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRelativeTime, initials } from "./format";

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  it("says now, minutes, hours and days", () => {
    assert.equal(formatRelativeTime("2026-10-20T11:59:50Z", "en", now), "now");
    assert.equal(formatRelativeTime("2026-10-20T11:55:00Z", "en", now), "5 minutes ago");
    assert.equal(formatRelativeTime("2026-10-20T15:00:00Z", "en", now), "in 3 hours");
    assert.equal(formatRelativeTime("2026-10-19T12:00:00Z", "en", now), "yesterday");
  });
  it("falls back to a dd/mm/yyyy date after a month", () => {
    assert.equal(formatRelativeTime("2026-08-01T10:00:00Z", "nl", now), "01/08/2026");
  });
});

describe("initials", () => {
  it("takes the first letters of two words", () => {
    assert.equal(initials("Bouwbedrijf Peeters"), "BP");
    assert.equal(initials("jan"), "J");
  });
  it("can skip empty parts and split on other separators", () => {
    assert.equal(initials(" Jan Peeters"), "J");
    assert.equal(initials(" Jan Peeters", { skipEmpty: true }), "JP");
    assert.equal(initials("jan.peeters@example.com", { separator: /[\s@.]+/, skipEmpty: true }), "JP");
  });
});
