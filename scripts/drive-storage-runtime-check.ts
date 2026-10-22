/**
 * Runtime check of "Drive as storage for bill documents" against a fake Google Drive (injected fetch, in this
 * process) on a throwaway database that is dropped afterwards, with file storage in a temporary folder. Never
 * touches the real data or anyone's real Drive.
 *
 *   npx tsx scripts/drive-storage-runtime-check.ts
 *
 * Needs `DATABASE_URL` in .env with a role that may create databases. Checks: setting up a new "Facturen" folder,
 * an expense attachment (two chunks) landing in Drive in the year folder with the local copy gone, downloading it
 * (whole and a range), the fallback when Drive is down (local + pending) and the retry job moving it later, a copy
 * failing verification (discarded in Drive, local kept), "move existing" with verification, "Also remove from
 * Drive" off/on, and disconnecting (new bills stay local, not queued; status paused).
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import pg from "pg";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const DB = `wh_drive_check_${process.pid}`;
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

// ── Fake Google Drive ────────────────────────────────────────────────────────────────────────────────

type FakeFile = { id: string; name: string; mimeType: string; parents: string[]; bytes: Buffer | null; trashed: boolean };
const FOLDER = "application/vnd.google-apps.folder";
const drive = {
  files: new Map<string, FakeFile>(),
  sessions: new Map<string, { name: string; mimeType: string; parents: string[]; size: number; data: Buffer[]; have: number }>(),
  mode: "ok" as "ok" | "down" | "corrupt",
  puts: 0,
  counter: 0,
};
const newId = () => `fake${++drive.counter}Id`;
const hex = (algorithm: string, bytes: Buffer) => createHash(algorithm).update(bytes).digest("hex");

async function fakeFetch(input: URL | string, init?: RequestInit): Promise<Response> {
  const url = new URL(input);
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fake-access", expires_in: 3600, scope: "" });
  if (drive.mode === "down") return Response.json({ error: { errors: [{ reason: "backendError" }] } }, { status: 503 });
  const bodyText = () => (typeof init?.body === "string" ? init.body : "");
  const bodyBytes = () => Buffer.from((init?.body as Uint8Array | undefined) ?? new Uint8Array(0));

  if (url.pathname === "/drive/v3/files" && method === "POST") {
    const meta = JSON.parse(bodyText()) as { name: string; mimeType: string; parents?: string[] };
    const file: FakeFile = { id: newId(), name: meta.name, mimeType: meta.mimeType, parents: meta.parents ?? ["root"], bytes: null, trashed: false };
    drive.files.set(file.id, file);
    return Response.json({ id: file.id, name: file.name });
  }
  if (url.pathname === "/drive/v3/files" && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    const name = /name = '([^']+)'/.exec(q)?.[1];
    const found = [...drive.files.values()].filter((file) => !file.trashed && file.parents.includes(parent ?? "") && (!name || file.name === name));
    return Response.json({ files: found.map((file) => ({ id: file.id })) });
  }
  const single = /^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
  if (single?.[1]) {
    const file = drive.files.get(single[1]);
    if (!file) return Response.json({ error: { errors: [{ reason: "notFound" }] } }, { status: 404 });
    if (method === "DELETE") {
      drive.files.delete(file.id);
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") {
      Object.assign(file, JSON.parse(bodyText()) as Partial<FakeFile>);
      return Response.json({ id: file.id });
    }
    if (url.searchParams.get("alt") === "media" && file.bytes) {
      const range = /bytes=(\d+)-(\d+)/.exec(headers.get("range") ?? "");
      if (range) return new Response(file.bytes.subarray(Number(range[1]), Number(range[2]) + 1), { status: 206 });
      return new Response(file.bytes, { status: 200, headers: { "content-length": String(file.bytes.length) } });
    }
    return Response.json({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      parents: file.parents,
      trashed: file.trashed,
      capabilities: { canAddChildren: true },
      ...(file.bytes && { size: String(file.bytes.length) }),
    });
  }
  if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
    const meta = JSON.parse(bodyText()) as { name: string; mimeType: string; parents: string[] };
    if (!meta.parents.every((parent) => drive.files.get(parent)?.mimeType === FOLDER)) {
      return Response.json({ error: { errors: [{ reason: "notFound" }] } }, { status: 404 });
    }
    const id = newId();
    drive.sessions.set(id, { ...meta, size: Number(headers.get("x-upload-content-length")), data: [], have: 0 });
    return new Response(null, { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` } });
  }
  if (url.pathname === "/upload/drive/v3/files" && method === "PUT") {
    const session = drive.sessions.get(url.searchParams.get("upload_id") ?? "");
    if (!session) return new Response(null, { status: 404 });
    const range = headers.get("content-range") ?? "";
    if (!range.startsWith("bytes */")) {
      drive.puts += 1;
      const chunk = bodyBytes();
      session.data.push(chunk);
      session.have += chunk.length;
    }
    if (session.have < session.size) return new Response(null, { status: 308, headers: { range: `bytes=0-${session.have - 1}` } });
    const bytes = Buffer.concat(session.data);
    const file: FakeFile = { id: newId(), name: session.name, mimeType: session.mimeType, parents: session.parents, bytes, trashed: false };
    drive.files.set(file.id, file);
    return Response.json({
      id: file.id,
      name: file.name,
      size: String(bytes.length),
      md5Checksum: hex("md5", bytes),
      sha256Checksum: drive.mode === "corrupt" ? "0".repeat(64) : hex("sha256", bytes),
    });
  }
  return new Response(`fake drive: no route for ${method} ${url.pathname}`, { status: 400 });
}

// ── The check ────────────────────────────────────────────────────────────────────────────────────────

async function readAll(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && !entry.name.startsWith(".")).map((entry) => path.join(entry.parentPath, entry.name));
}

let storageDir = "";

async function main() {
  await admin(`CREATE DATABASE "${DB}"`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "pipe" });
  storageDir = await mkdtemp(path.join(tmpdir(), "wh-drive-check-"));

  // The app modules read their configuration at import: point them at the throwaway database and fake keys.
  Object.assign(process.env, {
    DATABASE_URL: testUrl,
    STORAGE_DIR: storageDir,
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
  const documents = await import("../src/api/documents/documents.service");
  const targets = await import("../src/api/documents/document-targets.service");
  const { storageProvider } = await import("../src/api/documents/storage/storage");
  const driveStorage = await import("../src/api/integrations/drive-storage.service");
  await import("../src/api/integrations/google-drive.service"); // the Drive storage backend

  try {
    const household = await db.household.create({ data: { name: "Drive check" } });
    const owner = await db.user.create({ data: { email: `rob-${process.pid}@check.test`, passwordHash: "x", role: "OWNER", householdId: household.id } });
    const user = { id: owner.id, email: owner.email, name: "Rob", role: "owner" as const, locale: "en" as const, householdId: household.id, householdName: household.name, habitantId: null };
    await db.googleConnection.create({
      data: {
        userId: owner.id,
        householdId: household.id,
        googleAccountEmail: "rob@gmail.com",
        googleSubject: "fake-sub",
        refreshTokenEnc: encryptSecret("fake-refresh", refreshTokenContext(owner.id)),
        scopes: scopesFor(["drive"]),
      },
    });

    const expenseId = "cmexpense0000000000000001";
    const upload = async (name: string, bytes: Buffer, entityType: "bill" | "appliance" = "bill") => {
      const created = await documents.createFile(user, { name, mimeType: "application/pdf", sizeBytes: bytes.length, link: { entityType, entityId: expenseId } });
      return documents.storeFileContent(household.id, created.id, Readable.from([bytes]), { contentType: "application/pdf", contentLength: String(bytes.length) });
    };
    const row = (id: string) => db.documentFile.findUniqueOrThrow({ where: { id } });
    const dueNow = (id: string) => db.documentFile.update({ where: { id }, data: { targetNextAttemptAt: new Date(Date.now() - 1000) } });

    // 0. Before any target: bill documents stay on the server.
    const oldBills = [randomBytes(150_000), randomBytes(2_000)];
    const oldIds = [];
    for (const [index, bytes] of oldBills.entries()) oldIds.push((await upload(`Oude factuur ${index + 1}.pdf`, bytes)).id);
    const manual = await upload("Handleiding wasmachine.pdf", randomBytes(5_000), "appliance");
    check("without a target bills stay local", (await row(oldIds[0]!)).storageProvider === "LOCAL" && (await row(oldIds[0]!)).pendingTarget === null);

    // 1. Set up: a new "Facturen" folder in Rob's Drive (drive.file), year subfolders.
    const afterSetup = await driveStorage.setupDriveStorage(user, "bills", { mode: "create", folderName: "Facturen", yearSubfolders: true });
    const facturen = [...drive.files.values()].find((file) => file.name === "Facturen");
    check("setup creates the folder in My Drive", facturen?.mimeType === FOLDER && facturen.parents[0] === "root");
    check("status: active, 2 bill documents on the server", afterSetup.targets[0]?.state === "active" && afterSetup.targets[0].counts.local === 2, JSON.stringify(afterSetup.targets[0]?.counts));

    // 2. An expense attachment (two 8 MiB chunks) goes to Drive, in "2026", verified; the local copy is gone.
    const big = randomBytes(9_000_000);
    const localBefore = (await listFiles(storageDir)).length;
    drive.puts = 0;
    const stored = await upload("Factuur Engie oktober 2026.pdf", big);
    const storedRow = await row(stored.id);
    const year = [...drive.files.values()].find((file) => file.mimeType === FOLDER && file.parents[0] === facturen?.id);
    const inDrive = drive.files.get(storedRow.externalId ?? "");
    check("upload lands in Drive", stored.storageProvider === "google_drive" && storedRow.storageKey?.startsWith(`gdrive-target:bills:${owner.id}:`) === true, storedRow.storageKey ?? "");
    check("in the year folder below Facturen", year?.name === String(new Date().getFullYear()) && inDrive?.parents[0] === year.id);
    check("resumable upload in 2 chunks", drive.puts === 2, `${drive.puts} PUTs`);
    check("Drive copy is byte-identical", inDrive?.bytes?.equals(big) === true);
    check("no local copy left", (await listFiles(storageDir)).length === localBefore);
    const opened = await documents.openFileContent(household.id, stored.id);
    check("download through the server", (await readAll(await opened.open())).equals(big));
    check("range download", (await readAll(await opened.open({ start: 100, end: 199 }))).equals(big.subarray(100, 200)));

    // 3. Drive down: kept locally, pending; the retry job moves it once Drive is back.
    drive.mode = "down";
    const fallback = await upload("Factuur Fluvius oktober 2026.pdf", randomBytes(40_000));
    const fallbackRow = await row(fallback.id);
    check("Drive down: stored locally, marked pending", fallback.storageProvider === "local" && fallback.pendingStorageTarget === "bills" && fallbackRow.targetAttempts === 1, fallbackRow.targetError ?? "");
    check("pending file still opens", (await readAll(await (await documents.openFileContent(household.id, fallback.id)).open())).length === 40_000);
    const notDue = await targets.processDueMoves();
    check("not retried before it is due", notDue.moved === 0 && notDue.failed === 0, JSON.stringify(notDue));
    await dueNow(fallback.id);
    const stillDown = await targets.processDueMoves();
    const afterFail = await row(fallback.id);
    check("retry while Drive is down fails and backs off", stillDown.failed === 1 && afterFail.targetAttempts === 2 && (afterFail.targetNextAttemptAt?.getTime() ?? 0) > Date.now());
    drive.mode = "ok";
    await dueNow(fallback.id);
    const retried = await targets.processDueMoves();
    const movedRow = await row(fallback.id);
    check("retry job moves it once Drive is back", retried.moved === 1 && movedRow.storageProvider === "GOOGLE_DRIVE" && movedRow.pendingTarget === null && movedRow.targetError === null);
    check("its local copy is gone", !(await storageProvider("LOCAL").stat(fallbackRow.storageKey ?? "")));

    // 4. A copy that fails verification is discarded in Drive; the local file stays and waits.
    drive.mode = "corrupt";
    const driveCountBefore = drive.files.size;
    const corrupt = await upload("Factuur Telenet oktober 2026.pdf", randomBytes(30_000));
    const corruptRow = await row(corrupt.id);
    check("unverified copy: local kept, pending", corrupt.storageProvider === "local" && corruptRow.pendingTarget === "bills" && /SHA-256 differs/.test(corruptRow.targetError ?? ""), corruptRow.targetError ?? "");
    check("unverified copy removed from Drive", drive.files.size === driveCountBefore);
    check("local bytes intact", (await storageProvider("LOCAL").stat(corruptRow.storageKey ?? ""))?.sizeBytes === 30_000);
    drive.mode = "ok";

    // 5. "Move existing": the two old bills (and the waiting one) move with verification; the manual stays.
    const oldKeys = await Promise.all(oldIds.map(async (id) => (await row(id)).storageKey ?? ""));
    const { queued } = await driveStorage.moveExistingToDrive(user, "bills");
    check("move existing queues the local bill documents", queued === 3, `${queued} queued`);
    const moved = await targets.processDueMoves();
    check("move existing moves them", moved.moved === 3 && moved.failed === 0, JSON.stringify(moved));
    for (const [index, id] of oldIds.entries()) {
      const after = await row(id);
      check(`old bill ${index + 1} in Drive and verified`, after.storageProvider === "GOOGLE_DRIVE" && drive.files.get(after.externalId ?? "")?.bytes?.equals(oldBills[index]!) === true);
      check(`old bill ${index + 1} local copy deleted`, !(await storageProvider("LOCAL").stat(oldKeys[index]!)));
    }
    check("the manual (not a bill) stays local", (await row(manual.id)).storageProvider === "LOCAL");
    const status = await driveStorage.getDriveStorageStatus(user);
    check("status counts", status.targets[0]?.counts.inDrive === 5 && status.targets[0].counts.local === 0 && status.targets[0].counts.pending === 0, JSON.stringify(status.targets[0]?.counts));

    // 6. Deleting for good: Drive untouched by default; moved to Drive's trash with "Also remove from Drive".
    await documents.trashFile(household.id, oldIds[0]!);
    const keptId = (await row(oldIds[0]!)).externalId ?? "";
    await documents.deleteFilePermanently(household.id, oldIds[0]!);
    check("delete keeps the Drive file by default", drive.files.get(keptId)?.trashed === false);
    await driveStorage.updateDriveStorage(user, "bills", { deleteInDrive: true });
    const removeId = (await row(oldIds[1]!)).externalId ?? "";
    await documents.trashFile(household.id, oldIds[1]!);
    await documents.deleteFilePermanently(household.id, oldIds[1]!);
    check("with 'Also remove from Drive' it goes to Drive's trash", drive.files.get(removeId)?.trashed === true);

    // 7. Disconnect: new bills stay local and aren't queued; status says paused.
    await db.googleConnection.delete({ where: { userId: owner.id } });
    const afterDisconnect = await upload("Factuur Proximus oktober 2026.pdf", randomBytes(10_000));
    const disconnectedStatus = await driveStorage.getDriveStorageStatus(user);
    check("disconnected: new bill stays local, not pending", afterDisconnect.storageProvider === "local" && !afterDisconnect.pendingStorageTarget);
    check("disconnected: status paused", disconnectedStatus.targets[0]?.state === "paused" && disconnectedStatus.targets[0].pausedReason === "disconnected");
    const unreachable = await documents.openFileContent(household.id, stored.id).then((file) => file.open()).then(() => "opened", (error: Error) => error.constructor.name);
    check("a Drive document can't open while disconnected", unreachable === "StorageNotFoundError", unreachable);
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
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
    await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).then(
      () => console.log(`dropped ${DB}`),
      (error: unknown) => console.error(`could not drop ${DB}:`, error),
    );
    console.log(failures ? `${failures} check(s) failed` : "all checks passed");
    process.exit(failures ? 1 : 0);
  });
