/**
 * Unit tests for the Google integration: secrets, PKCE/state, token refresh with a fake Google, calendar
 * mapping (all-day, time zones, publishing plan incl. instant pushes and their debounce) and reading bills
 * from mail. No database, no network.
 *
 *   npx tsx --test src/api/integrations/google.test.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import { featuresFromScopes, GOOGLE_FEATURE_SCOPES } from "@/features/integrations/types/google";
import { decryptSecret, encryptSecret, parseKey } from "../lib/secrets";
import { dateInZone, mapGoogleEvent, payloadHash, planPublish, publishPayload, type PublishableEvent } from "./google-calendar-mapping";
import { createHouseholdDebouncer } from "./google-calendar-push";
import { GoogleApiError, googleRequest, setGoogleFetch } from "./google-http";
import {
  AccessTokenCache,
  buildAuthUrl,
  canFinish,
  canReceiveCode,
  createPkcePair,
  decodeIdToken,
  isRevokedError,
  mergeScopes,
  parseTokenResponse,
  pkceChallenge,
  refreshAccessToken,
  scopesFor,
} from "./google-oauth";
import {
  dedupeKey,
  extractBill,
  findAmount,
  findDueDate,
  findIban,
  findStructuredCommunication,
  gmailQuery,
  matchRule,
  parseAmountToCents,
  senderAddress,
} from "./gmail-extract";
import { extractPdfText } from "./pdf-text";

const realFetch = setGoogleFetch((input, init) => fetch(input, init));
after(() => setGoogleFetch(realFetch));

describe("secrets (AES-256-GCM)", () => {
  const key = randomBytes(32);

  it("round-trips and binds the context", () => {
    const sealed = encryptSecret("1//refresh-token", "google:refresh:u1", key);
    assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(decryptSecret(sealed, "google:refresh:u1", key), "1//refresh-token");
    assert.throws(() => decryptSecret(sealed, "google:refresh:u2", key));
    assert.throws(() => decryptSecret(sealed, "google:refresh:u1", randomBytes(32)));
  });

  it("detects tampering and uses a fresh IV every time", () => {
    const sealed = encryptSecret("secret", "", key);
    const [version, iv, tag, data] = sealed.split(".");
    const flipped = Buffer.from(data ?? "", "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    assert.throws(() => decryptSecret([version, iv, tag, flipped.toString("base64url")].join("."), "", key));
    assert.notEqual(encryptSecret("secret", "", key), sealed);
  });

  it("accepts only 32-byte base64 keys", () => {
    assert.equal(parseKey(randomBytes(32).toString("base64"))?.length, 32);
    assert.equal(parseKey(randomBytes(16).toString("base64")), null);
    assert.equal(parseKey(undefined), null);
  });
});

describe("OAuth: PKCE, state, consent URL", () => {
  it("computes the S256 challenge: base64url(SHA-256(verifier)), no padding", async () => {
    const { verifier, challenge } = createPkcePair();
    const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    assert.equal(challenge, digest.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.match(verifier, /^[A-Za-z0-9_-]{64}$/);
    assert.equal(challenge, pkceChallenge(verifier));
  });

  it("asks only the scopes of the chosen features (plus openid/email)", () => {
    assert.deepEqual(scopesFor(["gmail"]), ["email", "https://www.googleapis.com/auth/gmail.readonly", "openid"]);
    assert.ok(!scopesFor(["calendar"]).some((scope) => scope.includes("gmail")));
    const granted = mergeScopes(scopesFor(["calendar"]), GOOGLE_FEATURE_SCOPES.drive);
    assert.deepEqual(featuresFromScopes(granted), ["calendar", "drive"]);
  });

  it("builds an incremental, offline consent URL with PKCE", () => {
    const url = new URL(
      buildAuthUrl({ clientId: "cid", redirectUri: "https://home.example/cb", scopes: ["openid", "email"], state: "st", codeChallenge: "ch", loginHint: "rob@gmail.com" }),
    );
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    const params = Object.fromEntries(url.searchParams);
    assert.equal(params.code_challenge_method, "S256");
    assert.equal(params.code_challenge, "ch");
    assert.equal(params.access_type, "offline");
    assert.equal(params.include_granted_scopes, "true");
    assert.equal(params.state, "st");
    assert.equal(params.scope, "openid email");
    assert.equal(params.login_hint, "rob@gmail.com");
  });

  it("lets a state take one code, and only its own session finish it", () => {
    const now = new Date("2026-10-03T10:00:00Z");
    const fresh = { sessionId: "s1", expiresAt: new Date("2026-10-03T10:05:00Z"), codeEnc: null };
    assert.ok(canReceiveCode(fresh, now));
    assert.ok(!canReceiveCode({ ...fresh, codeEnc: "x" }, now), "used");
    assert.ok(!canReceiveCode({ ...fresh, expiresAt: new Date("2026-10-03T09:59:00Z") }, now), "expired");
    assert.ok(!canReceiveCode(null, now));
    const withCode = { ...fresh, codeEnc: "x" };
    assert.ok(canFinish(withCode, "s1", now));
    assert.ok(!canFinish(withCode, "s2", now), "other session");
    assert.ok(!canFinish(withCode, undefined, now), "no session");
    assert.ok(!canFinish(fresh, "s1", now), "no code yet");
  });
});

describe("OAuth: tokens", () => {
  const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

  it("parses token responses and ID tokens", () => {
    const set = parseTokenResponse({ access_token: "at", expires_in: 3599, refresh_token: "rt", scope: "openid email", id_token: "i" }, 1_000);
    assert.deepEqual(set, { accessToken: "at", expiresAt: 1_000 + 3_599_000, refreshToken: "rt", scopes: ["email", "openid"], idToken: "i" });
    assert.equal(parseTokenResponse({ access_token: "at" }).refreshToken, null);
    assert.throws(() => parseTokenResponse({}));
    assert.deepEqual(decodeIdToken(idToken({ sub: "123", email: "rob@gmail.com" })), { subject: "123", email: "rob@gmail.com" });
    assert.throws(() => decodeIdToken(idToken({ sub: "123" })));
  });

  it("refreshes against Google's token endpoint (fake) and recognises a revoked consent", async () => {
    const calls: { url: string; body: string }[] = [];
    setGoogleFetch(async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body) });
      const body = new URLSearchParams(String(init?.body));
      if (body.get("refresh_token") === "revoked") {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600, scope: "openid" }), { status: 200 });
    });
    const set = await refreshAccessToken({ clientId: "cid", clientSecret: "secret" }, "good");
    assert.equal(set.accessToken, "fresh");
    assert.equal(calls[0]?.url, "https://oauth2.googleapis.com/token");
    const sent = new URLSearchParams(calls[0]?.body);
    assert.equal(sent.get("grant_type"), "refresh_token");
    assert.equal(sent.get("client_id"), "cid");

    const error = await refreshAccessToken({ clientId: "cid", clientSecret: "secret" }, "revoked").catch((caught: unknown) => caught);
    assert.ok(error instanceof GoogleApiError);
    assert.equal(error.reason, "invalid_grant");
    assert.ok(isRevokedError(error));
    assert.ok(!String(error.message).includes("revoked"), "no token in messages");
  });

  it("refuses hosts that aren't Google's", async () => {
    await assert.rejects(googleRequest("https://evil.example/token"), /Host not allowed/);
    await assert.rejects(googleRequest("http://oauth2.googleapis.com/token"), /Host not allowed/);
  });

  it("caches access tokens until shortly before expiry and shares one refresh", async () => {
    let now = 0;
    let refreshes = 0;
    const cache = new AccessTokenCache(() => now, 60_000);
    const refresh = async () => {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return parseTokenResponse({ access_token: `t${refreshes}`, expires_in: 3600 }, now);
    };
    const [a, b] = await Promise.all([cache.get("c1", refresh), cache.get("c1", refresh)]);
    assert.equal(a, "t1");
    assert.equal(b, "t1");
    assert.equal(refreshes, 1);
    now = 3_000_000;
    assert.equal(await cache.get("c1", refresh), "t1");
    now = 3_550_000; // within the minute before expiry
    assert.equal(await cache.get("c1", refresh), "t2");
    cache.forget("c1");
    assert.equal(await cache.get("c1", refresh), "t3");
    await assert.rejects(cache.get("c2", () => Promise.reject(new Error("down"))));
    assert.equal(await cache.get("c2", refresh), "t4", "a failure isn't cached");
  });
});

describe("calendar mapping", () => {
  it("maps all-day events with Google's exclusive end date", () => {
    const single = mapGoogleEvent({ id: "a", summary: "Verlof", start: { date: "2026-10-05" }, end: { date: "2026-10-06" } });
    assert.deepEqual(
      { allDay: single?.allDay, start: single?.start, end: single?.end, startDay: single?.startDay, endDay: single?.endDay },
      { allDay: true, start: "2026-10-05", end: "2026-10-05", startDay: "2026-10-05", endDay: "2026-10-05" },
    );
    const trip = mapGoogleEvent({ id: "b", summary: "Ardennen", start: { date: "2026-10-30" }, end: { date: "2026-11-02" } });
    assert.equal(trip?.end, "2026-11-01");
  });

  it("maps timed events to instants and Brussels days", () => {
    // 00:30 in Brussels (summer time) is still the previous day in UTC.
    const late = mapGoogleEvent({ id: "c", summary: "Nachttrein", start: { dateTime: "2026-07-02T00:30:00+02:00", timeZone: "Europe/Brussels" }, end: { dateTime: "2026-07-02T02:00:00+02:00" } });
    assert.equal(late?.start, "2026-07-01T22:30:00.000Z");
    assert.equal(late?.startDay, "2026-07-02");
    // An event in another time zone: the offset decides the instant.
    const ny = mapGoogleEvent({ id: "d", summary: "Call", start: { dateTime: "2026-01-15T09:00:00-05:00", timeZone: "America/New_York" }, end: { dateTime: "2026-01-15T10:00:00-05:00" } });
    assert.equal(ny?.start, "2026-01-15T14:00:00.000Z");
    assert.equal(ny?.startDay, "2026-01-15");
    // Ending exactly at midnight doesn't touch the next day.
    const evening = mapGoogleEvent({ id: "e", summary: "Feest", start: { dateTime: "2026-12-31T20:00:00+01:00" }, end: { dateTime: "2027-01-01T00:00:00+01:00" } });
    assert.equal(evening?.endDay, "2026-12-31");
    assert.equal(dateInZone(new Date("2026-03-29T00:30:00Z")), "2026-03-29");
  });

  it("drops cancelled events and keeps titles safe", () => {
    assert.equal(mapGoogleEvent({ id: "f", status: "cancelled" }), null);
    assert.equal(mapGoogleEvent({ id: "g", start: { date: "2026-10-05" }, end: { date: "2026-10-06" } })?.title, "—");
    assert.equal(mapGoogleEvent({ id: "h", summary: "x", htmlLink: "javascript:alert(1)", start: { date: "2026-10-05" }, end: { date: "2026-10-06" } })?.htmlLink, null);
  });

  it("plans one-way publishing: create, update when changed, remove, move to another calendar", () => {
    const event = (id: string, title = id): PublishableEvent => ({
      id, title, description: null, location: null, allDay: true, startDate: "2026-10-10", endDate: "2026-10-11", startsAt: null, endsAt: null, rrule: null,
    });
    const hash = (item: PublishableEvent) => payloadHash(publishPayload(item));
    const published = [
      { calendarEventId: "same", googleEventId: "g1", googleCalendarId: "cal", contentHash: hash(event("same")) },
      { calendarEventId: "changed", googleEventId: "g2", googleCalendarId: "cal", contentHash: hash(event("changed", "old")) },
      { calendarEventId: "gone", googleEventId: "g3", googleCalendarId: "cal", contentHash: "x" },
      { calendarEventId: "moved", googleEventId: "g4", googleCalendarId: "old-cal", contentHash: hash(event("moved")) },
    ];
    const plan = planPublish([event("same"), event("changed"), event("new"), event("moved")], published, "cal");
    assert.deepEqual(plan.create.map((item) => item.id).sort(), ["moved", "new"]);
    assert.deepEqual(plan.update.map((item) => item.googleEventId), ["g2"]);
    assert.deepEqual(plan.remove.map((item) => item.googleEventId).sort(), ["g3", "g4"]);
    const off = planPublish([event("same")], published, null);
    assert.equal(off.create.length + off.update.length, 0);
    assert.equal(off.remove.length, 4);
  });

  it("plans an instant push for just the changed events, leaving other published events alone", () => {
    const event = (id: string, title = id): PublishableEvent => ({
      id, title, description: null, location: null, allDay: true, startDate: "2026-10-10", endDate: "2026-10-10", startsAt: null, endsAt: null, rrule: null,
    });
    const hash = (item: PublishableEvent) => payloadHash(publishPayload(item));
    const published = [
      { calendarEventId: "a", googleEventId: "ga", googleCalendarId: "cal", contentHash: hash(event("a")) },
      { calendarEventId: "b", googleEventId: "gb", googleCalendarId: "cal", contentHash: hash(event("b")) },
      { calendarEventId: "c", googleEventId: "gc", googleCalendarId: "cal", contentHash: hash(event("c")) },
    ];
    // New event: created; the published ones (not in `wanted`, not looked up) stay.
    const created = planPublish([event("new")], published, "cal", ["new"]);
    assert.deepEqual([created.create.map((item) => item.id), created.update, created.remove], [["new"], [], []]);
    // Edited: updated only.
    const edited = planPublish([event("a", "A (moved)")], published, "cal", ["a"]);
    assert.deepEqual([edited.create, edited.update.map((item) => item.googleEventId), edited.remove], [[], ["ga"], []]);
    // Moved to a category that isn't published (or deleted): not wanted any more → removed, the others kept.
    const unpublished = planPublish([], published, "cal", ["b"]);
    assert.deepEqual(unpublished.remove.map((item) => item.googleEventId), ["gb"]);
    assert.equal(unpublished.create.length + unpublished.update.length, 0);
    // Wanted/published rows outside the subset are ignored even when passed in.
    const subset = planPublish([event("a", "changed"), event("other"), event("c")], published, "cal", ["c"]);
    assert.deepEqual([subset.create, subset.update, subset.remove], [[], [], []]);
    // Without a subset the same input is a full reconcile (the 15-minute job).
    assert.equal(planPublish([], published, "cal").remove.length, 3);
  });

  it("publishes all-day events with an exclusive end and timed events with the household zone", () => {
    const allDay = publishPayload({ id: "x", title: "Kamp", description: null, location: null, allDay: true, startDate: "2026-07-01", endDate: "2026-07-03", startsAt: null, endsAt: null, rrule: "FREQ=YEARLY" });
    assert.deepEqual(allDay.start, { date: "2026-07-01" });
    assert.deepEqual(allDay.end, { date: "2026-07-04" });
    assert.deepEqual(allDay.recurrence, ["RRULE:FREQ=YEARLY"]);
    const timed = publishPayload({ id: "y", title: "Zwemles", description: null, location: null, allDay: false, startDate: "2026-10-07", endDate: "2026-10-07", startsAt: new Date("2026-10-07T15:00:00Z"), endsAt: new Date("2026-10-07T16:00:00Z"), rrule: null });
    assert.deepEqual(timed.start, { dateTime: "2026-10-07T15:00:00.000Z", timeZone: "Europe/Brussels" });
  });
});

describe("instant publishing: per-household debounce", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("collects a burst of changes into one push per household", async () => {
    const runs: [string, string[]][] = [];
    const queue = createHouseholdDebouncer(
      async (householdId, ids) => {
        runs.push([householdId, ids.sort()]);
      },
      { delayMs: 300 },
    );
    queue.schedule("h1", "e1");
    queue.schedule("h1", "e2");
    queue.schedule("h2", "x1");
    await sleep(100);
    queue.schedule("h1", "e1");
    queue.schedule("h1", "e3");
    assert.deepEqual(queue.pendingIds("h1").sort(), ["e1", "e2", "e3"]);
    await sleep(250);
    // h1's timer restarted with the last change; h2 has been pushed.
    assert.deepEqual(runs, [["h2", ["x1"]]]);
    await sleep(150);
    assert.deepEqual(runs, [
      ["h2", ["x1"]],
      ["h1", ["e1", "e2", "e3"]],
    ]);
    assert.deepEqual(queue.pendingIds("h1"), []);
  });

  it("pushes at the latest after maxWait while changes keep coming", async () => {
    const runs: string[][] = [];
    const queue = createHouseholdDebouncer(
      async (_householdId, ids) => {
        runs.push(ids);
      },
      { delayMs: 30, maxWaitMs: 60 },
    );
    for (let index = 0; index < 6; index++) {
      queue.schedule("h1", `e${index}`);
      await sleep(15);
    }
    await queue.flushAll();
    assert.ok(runs.length >= 2, `expected an intermediate push, got ${runs.length}`);
    assert.deepEqual(runs.flat().sort(), ["e0", "e1", "e2", "e3", "e4", "e5"]);
  });

  it("runs pushes of one household one after the other and survives a failing push", async (t) => {
    const logged = t.mock.method(console, "error", () => undefined);
    const order: string[] = [];
    let active = 0;
    const queue = createHouseholdDebouncer(
      async (_householdId, ids) => {
        active++;
        assert.equal(active, 1, "two pushes of one household at once");
        order.push(`start ${ids.join()}`);
        await sleep(20);
        active--;
        order.push(`end ${ids.join()}`);
        if (ids.includes("bad")) throw new Error("Google said no");
      },
      { delayMs: 5 },
    );
    queue.schedule("h1", "bad");
    await sleep(10);
    queue.schedule("h1", "good");
    await sleep(10);
    await queue.flushAll();
    await sleep(30);
    assert.deepEqual(order, ["start bad", "end bad", "start good", "end good"]);
    assert.equal(logged.mock.callCount(), 1);
  });
});

describe("bills from mail", () => {
  it("reads Belgian, French and English amounts", () => {
    assert.equal(parseAmountToCents("1.234,56"), 123456);
    assert.equal(parseAmountToCents("1 234,56"), 123456);
    assert.equal(parseAmountToCents("1,234.56"), 123456);
    assert.equal(parseAmountToCents("89,90"), 8990);
    assert.equal(parseAmountToCents("12,5"), 1250);
    assert.equal(parseAmountToCents("1.234"), 123400);
    assert.equal(parseAmountToCents("abc"), null);
    assert.equal(findAmount("Te betalen bedrag: € 1.234,56"), 123456);
    assert.equal(findAmount("Montant à payer : 89,90 EUR"), 8990);
    assert.equal(findAmount("Amount due €45.00"), 4500);
    assert.equal(findAmount("Voorschot vorige maand € 50,00. Totaal te betalen € 112,35 voor 15/10/2026"), 11235);
    assert.equal(findAmount("Je factuur van Telenet: € 62,00"), 6200);
    assert.equal(findAmount("Klantnummer 1234567"), null);
  });

  it("takes an invoice's total with VAT, never the subtotal without it", () => {
    // A craftsman's invoice: the subtotal comes first and says "totaal" too.
    assert.equal(findAmount("Totaal excl. BTW € 130,00\nBTW 6% € 7,80\nTotaal incl. BTW € 137,80"), 13780);
    assert.equal(findAmount("Subtotaal € 130,00\nBTW 21% € 27,30\nTotaal € 157,30"), 15730);
    assert.equal(findAmount("Totaal exclusief btw 130,00 EUR\nTotaal 137,00 EUR"), 13700);
    assert.equal(findAmount("Total HTVA 100,00 €\nTVA 21 % 21,00 €\nTotal TVAC 121,00 €"), 12100);
    // Plain totals without a "to pay" word: the largest is the one with VAT.
    assert.equal(findAmount("Totaal € 130,00\nTotaal € 137,00"), 13700);
  });

  it("the PDF wins over the mail's text", () => {
    const bill = extractBill(["Totaal excl. btw € 130,00\nTotaal incl. btw € 137,00", "het totale bedrag van € 0 binnen de termijn", "Uw factuur"], "2026-10-06");
    assert.equal(bill.amountCents, 13700);
  });

  it("finds the structured communication (mod-97 checked) and the IBAN", () => {
    assert.equal(findStructuredCommunication("Mededeling: +++012/3456/78939+++"), "012345678939");
    assert.equal(findStructuredCommunication("Communication ***012/3456/78939***"), "012345678939");
    assert.equal(findStructuredCommunication("+++012/3456/78940+++"), null, "wrong check digits");
    assert.equal(findIban("Rekening BE68 5390 0754 7034 BIC GKCCBEBB"), "BE68539007547034");
    assert.equal(findIban("IBAN BE68 5390 0754 7035"), null);
  });

  it("finds a plausible due date in NL, FR and EN", () => {
    assert.equal(findDueDate("Vervaldag: 15/10/2026", "2026-10-01"), "2026-10-15");
    assert.equal(findDueDate("Te betalen vóór 20 oktober 2026", "2026-10-01"), "2026-10-20");
    assert.equal(findDueDate("Date d'échéance : 05.11.2026", "2026-10-01"), "2026-11-05");
    assert.equal(findDueDate("Due date: October 15, 2026", "2026-10-01"), "2026-10-15");
    assert.equal(findDueDate("Factuurdatum 01/10/2026", "2026-10-01"), null, "no due keyword");
    assert.equal(findDueDate("Vervaldag: 15/10/2019", "2026-10-01"), null, "implausible");
  });

  it("combines subject, body and PDF text; the first text with a field wins", () => {
    const bill = extractBill(
      ["Je factuur van oktober", "Bedrag: € 62,00", "Totaal te betalen € 99,99\nVervaldag 25/10/2026\n+++012/3456/78939+++\nBE68 5390 0754 7034"],
      "2026-10-03",
    );
    assert.deepEqual(bill, { amountCents: 6200, dueDate: "2026-10-25", structuredCommunication: "012345678939", iban: "BE68539007547034" });
  });

  it("matches senders and builds the Gmail search", () => {
    assert.equal(senderAddress('"Fluvius" <NoReply@Mail.Fluvius.be>'), "noreply@mail.fluvius.be");
    const rules = [
      { payee: "Fluvius", senders: ["fluvius.be"], enabled: true },
      { payee: "Luminus", senders: ["facturen@luminus.be"], enabled: true },
      { payee: "Off", senders: ["telenet.be"], enabled: false },
    ];
    assert.equal(matchRule("noreply@mail.fluvius.be", rules)?.payee, "Fluvius");
    assert.equal(matchRule("info@notfluvius.be", rules), null);
    assert.equal(matchRule("facturen@luminus.be", rules)?.payee, "Luminus");
    assert.equal(matchRule("other@luminus.be", rules), null);
    assert.equal(matchRule("x@telenet.be", rules), null);
    assert.equal(gmailQuery(["fluvius.be", "luminus.be", "fluvius.be"], 1_759_000_000.7), "from:(fluvius.be OR luminus.be) has:attachment filename:pdf after:1759000000");
  });

  it("reads text from a PDF with pdfjs-dist under Node", async () => {
    const content = "BT /F1 12 Tf 10 100 Td (Totaal te betalen EUR 62,00) Tj ET";
    const pdf = [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
      `4 0 obj<</Length ${content.length}>>stream`,
      content,
      "endstream endobj",
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
      "trailer<</Root 1 0 R>>",
      "%%EOF",
    ].join("\n");
    const text = await extractPdfText(new TextEncoder().encode(pdf));
    assert.match(text, /Totaal te betalen EUR 62,00/);
    assert.equal(findAmount(text), 6200);
    assert.equal(await extractPdfText(new TextEncoder().encode("not a pdf")), "");
  });

  it("gives the same bill one suggestion (de-duplication key)", () => {
    const base = { payee: "Fluvius", amountCents: 11235, dueDate: "2026-10-15", structuredCommunication: null, messageId: "m1" };
    assert.equal(dedupeKey(base), dedupeKey({ ...base, payee: " fluvius ", messageId: "m2" }), "same bill in two mailboxes");
    assert.notEqual(dedupeKey(base), dedupeKey({ ...base, amountCents: 11236 }));
    assert.equal(dedupeKey({ ...base, structuredCommunication: "012345678939" }), dedupeKey({ ...base, payee: "Other", structuredCommunication: "012345678939", messageId: "m9" }));
    assert.equal(dedupeKey({ ...base, amountCents: null }), "message:m1");
  });
});
