/**
 * Runtime check of instant publishing to Google Calendar (household event saved → pushed a few seconds later)
 * against a fake Google Calendar (injected fetch, in this process) on a throwaway database that is dropped
 * afterwards. Never touches the real data or anyone's real Google account.
 *
 *   npx tsx scripts/calendar-push-runtime-check.ts
 *
 * Needs `DATABASE_URL` in .env with a role that may create databases. Checks: the save itself doesn't call
 * Google; create → pushed within seconds; a burst of edits → one update; edit → updated; category changed to
 * one that isn't published → removed (other published events stay); delete → removed; Google down → error on
 * the connection, then the 15-minute job's sync publishes it and clears the error.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const DB = `wh_calpush_check_${process.pid}`;
const testUrl = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: BASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

// ── Fake Google Calendar ─────────────────────────────────────────────────────────────────────────────

const TARGET = "family-target@group.calendar.google.com";
type FakeEvent = { id: string; summary: string; wickedhomeEventId: string };
const google = { events: new Map<string, FakeEvent>(), calls: [] as string[], down: false, counter: 0 };

async function fakeFetch(input: URL | string, init?: RequestInit): Promise<Response> {
  const url = new URL(input);
  const method = init?.method ?? "GET";
  if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fake-access", expires_in: 3600, scope: "" });
  google.calls.push(`${method} ${url.pathname}`);
  if (google.down) return Response.json({ error: { errors: [{ reason: "backendError" }], message: "Backend Error" } }, { status: 503 });
  if (url.pathname === "/calendar/v3/users/me/calendarList") {
    return Response.json({ items: [{ id: TARGET, summary: "Gezin", backgroundColor: "#33b679", accessRole: "owner" }] });
  }
  const match = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);
  if (match && decodeURIComponent(match[1] ?? "") === TARGET) {
    const eventId = match[2] && decodeURIComponent(match[2]);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { summary: string; extendedProperties: { private: { wickedhomeEventId: string } } }) : null;
    if (!eventId && method === "POST" && body) {
      const event = { id: `g${++google.counter}`, summary: body.summary, wickedhomeEventId: body.extendedProperties.private.wickedhomeEventId };
      google.events.set(event.id, event);
      return Response.json({ id: event.id });
    }
    if (!eventId && method === "GET") return Response.json({ items: [], nextSyncToken: "sync" });
    const existing = eventId ? google.events.get(eventId) : undefined;
    if (!existing) return Response.json({ error: { errors: [{ reason: "notFound" }] } }, { status: 404 });
    if (method === "PUT" && body) {
      existing.summary = body.summary;
      return Response.json({ id: existing.id });
    }
    if (method === "DELETE") {
      google.events.delete(existing.id);
      return new Response(null, { status: 204 });
    }
  }
  return new Response(`fake google: no route for ${method} ${url.pathname}`, { status: 400 });
}

// ── The check ────────────────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `condition` holds (or the timeout), returns the seconds it took or null. */
async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 12_000): Promise<number | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await condition()) return (Date.now() - started) / 1000;
    await sleep(100);
  }
  return null;
}

const byWickedId = (eventId: string) => [...google.events.values()].filter((event) => event.wickedhomeEventId === eventId);
const writes = () => google.calls.filter((call) => !call.startsWith("GET")).length;

async function main() {
  await admin(`CREATE DATABASE "${DB}"`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "pipe" });

  // The app modules read their configuration at import: point them at the throwaway database and fake keys.
  Object.assign(process.env, {
    DATABASE_URL: testUrl,
    INTEGRATIONS_KEY: randomBytes(32).toString("base64"),
    GOOGLE_CLIENT_ID: "fake-client",
    GOOGLE_CLIENT_SECRET: "fake-secret",
  });
  const { setGoogleFetch } = await import("../src/api/integrations/google-http");
  setGoogleFetch(fakeFetch);
  const { db } = await import("../src/api/lib/db");
  const { encryptSecret } = await import("../src/api/lib/secrets");
  const { refreshTokenContext } = await import("../src/api/integrations/google-access");
  const { scopesFor } = await import("../src/api/integrations/google-oauth");
  const calendar = await import("../src/api/calendar/calendar.service");
  const { syncConnectionCalendars } = await import("../src/api/integrations/google-calendar.service");
  await import("../src/api/integrations/google-calendar-push"); // subscribes, as integrations.routes.ts does

  try {
    const household = await db.household.create({ data: { name: "Push check" } });
    const owner = await db.user.create({ data: { email: `rob-${process.pid}@check.test`, passwordHash: "x", role: "OWNER", householdId: household.id } });
    const connection = await db.googleConnection.create({
      data: {
        userId: owner.id,
        householdId: household.id,
        googleAccountEmail: "rob@gmail.com",
        googleSubject: "fake-sub",
        refreshTokenEnc: encryptSecret("fake-refresh", refreshTokenContext(owner.id)),
        scopes: scopesFor(["calendar", "calendar_publish"]),
      },
    });
    const target = await db.googleCalendar.create({
      data: { connectionId: connection.id, googleCalendarId: TARGET, name: "Gezin", color: "#33b679", accessRole: "owner", selected: false },
    });
    await db.googleConnection.update({ where: { id: connection.id }, data: { publishCalendarId: target.id, publishCategories: ["health", "school"] } });

    const input = (title: string, category: "health" | "school" | "work" | null) => ({
      kind: "event" as const,
      title,
      category,
      allDay: true,
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      participantIds: [],
    });

    // 1. Create: the save returns without calling Google, the event is in Google seconds later.
    const savedAt = Date.now();
    const dentist = await calendar.createEvent(household.id, input("Tandarts", "health"));
    const saveMs = Date.now() - savedAt;
    check("the save doesn't wait for Google", writes() === 0 && saveMs < 1000, `${saveMs} ms, ${writes()} Google write(s) during the request`);
    const created = await waitFor(() => byWickedId(dentist.id).length === 1);
    check("create → pushed within seconds", created !== null && created < 6, `${created ?? "not"} s`);
    const publishedAt = await waitFor(async () => (await db.googleConnection.findUniqueOrThrow({ where: { id: connection.id } })).lastPublishedAt !== null);
    const afterCreate = await db.googleConnection.findUniqueOrThrow({ where: { id: connection.id } });
    check("last published set, no error", publishedAt !== null && afterCreate.publishError === null);
    check("mapping stored", (await db.googlePublishedEvent.count({ where: { calendarEventId: dentist.id } })) === 1);

    // A second published event that must survive the changes to the first.
    const school = await calendar.createEvent(household.id, input("Oudercontact", "school"));
    await waitFor(() => byWickedId(school.id).length === 1);
    // An event in a category that isn't published never reaches Google.
    const work = await calendar.createEvent(household.id, input("Deadline", "work"));
    await sleep(4500);
    check("unpublished category isn't pushed", byWickedId(work.id).length === 0);

    // 2. A burst of edits is one update.
    const before = writes();
    await calendar.updateEvent(household.id, dentist.id, input("Tandarts 1", "health"));
    await calendar.updateEvent(household.id, dentist.id, input("Tandarts 2", "health"));
    await calendar.updateEvent(household.id, dentist.id, input("Tandarts (verplaatst)", "health"));
    const updated = await waitFor(() => byWickedId(dentist.id)[0]?.summary === "Tandarts (verplaatst)");
    await sleep(500);
    check("edit → updated within seconds", updated !== null && updated < 6, `${updated ?? "not"} s`);
    check("a burst of 3 edits is one PUT", writes() - before === 1 && google.calls.at(-1)?.startsWith("PUT") === true, google.calls.slice(-3).join(", "));

    // 3. Category changed to one that isn't published → removed; the other published event stays.
    await calendar.updateEvent(household.id, dentist.id, input("Tandarts (verplaatst)", "work"));
    const removed = await waitFor(() => byWickedId(dentist.id).length === 0);
    check("category no longer published → removed from Google", removed !== null && removed < 6, `${removed ?? "not"} s`);
    check("other published events stay", byWickedId(school.id).length === 1);
    check("mapping forgotten", (await db.googlePublishedEvent.count({ where: { calendarEventId: dentist.id } })) === 0);

    // And back: published again.
    await calendar.updateEvent(household.id, dentist.id, input("Tandarts (terug)", "health"));
    check("category published again → created again", (await waitFor(() => byWickedId(dentist.id).length === 1)) !== null);

    // 4. Delete → removed.
    await calendar.deleteEvent(household.id, school.id);
    const deleted = await waitFor(() => byWickedId(school.id).length === 0);
    check("delete → removed from Google", deleted !== null && deleted < 6, `${deleted ?? "not"} s`);
    check("the rest is still there", byWickedId(dentist.id).length === 1);

    // 5. Google down: the error is shown on the connection; the 15-minute job publishes it later.
    google.down = true;
    const recurring = await calendar.createEvent(household.id, { ...input("Zwemles", "school"), rrule: "FREQ=WEEKLY;BYDAY=WE" });
    const failed = await waitFor(async () => (await db.googleConnection.findUniqueOrThrow({ where: { id: connection.id } })).publishError !== null);
    check("Google down → publishError on the connection", failed !== null);
    google.down = false;
    const job = await syncConnectionCalendars(connection.id);
    const afterJob = await db.googleConnection.findUniqueOrThrow({ where: { id: connection.id } });
    check("the job's sync publishes it and clears the error", job.failed === 0 && byWickedId(recurring.id).length === 1 && afterJob.publishError === null, JSON.stringify(job));
    check("Google has exactly the published events", google.events.size === 2 && (await db.googlePublishedEvent.count()) === 2, `${google.events.size} in Google`);
  } finally {
    await db.$disconnect();
  }
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.error("FAIL runtime check crashed:", error);
  })
  .finally(async () => {
    await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).then(
      () => console.log(`dropped ${DB}`),
      (error: unknown) => console.error(`could not drop ${DB}:`, error),
    );
    console.log(failures ? `${failures} check(s) failed` : "all checks passed");
    process.exit(failures ? 1 : 0);
  });
