/**
 * Unit tests for the one date formatter (`@/types/date-format`): dd/mm/yyyy in both languages, 24-hour
 * times, calendar dates never shifted, instants on the Brussels wall clock (DST included). Run:
 *
 *   npx tsx --test src/types/date-format.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate, formatDateRange, formatDateTime, formatMonth, formatMonthName, formatShortDateRange, formatTime, formatWeekday } from "@/types/date-format";

describe("formatDate", () => {
  it("shows a calendar date as dd/mm/yyyy in both languages", () => {
    assert.equal(formatDate("2026-10-30", "nl"), "30/10/2026");
    assert.equal(formatDate("2026-10-30", "en"), "30/10/2026");
    assert.equal(formatDate("2027-01-05", "en"), "05/01/2027", "day and month always two digits, day first");
  });

  it("never shifts a calendar date, whatever the time zone asked", () => {
    assert.equal(formatDate("2026-10-01", "nl", { timeZone: "America/Los_Angeles" }), "01/10/2026");
    assert.equal(formatDate("2026-03-29", "nl", { timeZone: "Pacific/Kiritimati" }), "29/03/2026");
  });

  it("shows an instant on the Brussels wall clock (summer and winter time)", () => {
    // 22:30 UTC on 2 October is already 3 October in Brussels (CEST, UTC+2).
    assert.equal(formatDate("2026-10-02T22:30:00Z", "nl"), "03/10/2026");
    assert.equal(formatDate(new Date("2026-10-02T21:30:00Z"), "en"), "02/10/2026");
    // Winter (CET, UTC+1): 23:30 UTC on 31 December is New Year in Brussels.
    assert.equal(formatDate("2026-12-31T23:30:00Z", "en"), "01/01/2027");
    assert.equal(formatDate("2026-10-02T22:30:00Z", "en", { timeZone: "UTC" }), "02/10/2026");
  });

  it("adds a localised weekday only when asked", () => {
    assert.equal(formatDate("2026-10-03", "nl", { weekday: "short" }), "za 03/10/2026");
    assert.equal(formatDate("2026-10-03", "en", { weekday: "short" }), "Sat 03/10/2026");
    assert.equal(formatDate("2026-10-03", "nl", { weekday: "long" }), "zaterdag 03/10/2026");
    assert.equal(formatWeekday("2026-10-02T22:30:00Z", "en"), "Sat", "the Brussels day of an instant");
  });

  it("gives an empty string for something that is not a date", () => {
    assert.equal(formatDate("not a date", "nl"), "");
    assert.equal(formatDateTime("", "en"), "");
  });
});

describe("times and date-times", () => {
  it("uses 24-hour times on the Brussels clock", () => {
    assert.equal(formatTime("2026-10-03T12:05:00Z"), "14:05");
    assert.equal(formatTime("2026-12-03T12:05:00Z"), "13:05");
    assert.equal(formatTime("2026-10-02T22:00:00Z"), "00:00", "midnight is 00:00, not 24:00");
    assert.equal(formatTime("2026-10-03T12:05:00Z", "UTC"), "12:05");
  });

  it("shows a date-time as dd/mm/yyyy HH:mm in both languages", () => {
    assert.equal(formatDateTime("2026-10-03T19:45:00Z", "nl"), "03/10/2026 21:45");
    assert.equal(formatDateTime("2026-10-03T19:45:00Z", "en"), "03/10/2026 21:45");
    assert.equal(formatDateTime(new Date("2026-10-30T07:05:00Z"), "en", { weekday: "short" }), "Fri 30/10/2026 08:05");
  });
});

describe("compact forms", () => {
  it("month headers and month names keep their words", () => {
    assert.equal(formatMonth("2026-10", "nl"), "oktober 2026");
    assert.equal(formatMonth("2026-10", "en"), "October 2026");
    assert.equal(formatMonth("2026-10-30", "en"), "October 2026");
    assert.equal(formatMonthName(3, "nl"), "maart");
    assert.equal(formatMonthName(3, "en", "short"), "Mar");
  });

  it("formats a range, one date when both ends are the same", () => {
    assert.equal(formatDateRange("2026-09-28", "2026-10-04", "nl"), "28/09/2026 – 04/10/2026");
    assert.equal(formatDateRange("2026-10-04", "2026-10-04", "en"), "04/10/2026");
  });

  it("drops only the year in a short range within one year", () => {
    assert.equal(formatShortDateRange("2026-10-12", "2026-10-14", "nl", "2026"), "12/10 – 14/10");
    assert.equal(formatShortDateRange("2026-12-28", "2027-01-02", "en", "2026"), "28/12/2026 – 02/01/2027");
    assert.equal(formatShortDateRange("2027-10-12", "2027-10-14", "en", "2026"), "12/10/2027 – 14/10/2027");
  });
});
