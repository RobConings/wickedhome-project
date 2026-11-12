import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SessionUser } from "@/features/auth/types/auth";
import { normalizeBarcode } from "@/features/shopping/types/barcode-lookup";
import { xtraAddSchema, xtraConnectSchema, xtraCredentialsSchema, xtraListSchema, xtraRemoveSchema, xtraSearchSchema, type XtraListItem, type XtraListSnapshot, type XtraProduct, type XtraStatus } from "@/features/shopping/types/xtra";
import { db } from "../lib/db";
import { appActor, audit } from "../audit/audit.service";
import { forbidden, HttpError } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { publish } from "../lib/events";
import { secretsAvailable } from "../lib/secrets";
import { XtraClient } from "./xtra-client";
import { deleteXtraConnection, readXtraConnection, saveXtraConnection, withXtraLock, type XtraConnection } from "./xtra-store";

export const xtraAvailable = secretsAvailable;
const rate = createRateLimiter({ limit: 40, windowMs: 60_000 });
type Observation = { householdId: string; userId: string; revision: string; expiresAt: number; product: XtraProduct };
const offers = new Map<string, Observation>();
const observedItems = new Map<string, { revision: string; expiresAt: number; items: Map<string, XtraListItem> }>();
const snapshots = new Map<string, { revision: string; expiresAt: number; value: XtraListSnapshot }>();
const itemKey = (user: SessionUser) => `${user.householdId}:${user.id}`;
function manager(user: SessionUser) { if (user.role !== "owner") throw forbidden("Only household owners can manage the shared Xtra connection."); }
async function permitted(user: SessionUser) {
  const connection = await readXtraConnection(user.householdId);
  if (!connection || !connection.userIds.includes(user.id)) throw forbidden("You don't have access to the shared Xtra connection. Ask a household owner to grant access in Settings.");
  if (connection.needsReconnect) throw new HttpError(409, "xtra_reconnect", "The shared Xtra connection needs a new login. Ask a household owner to reconnect in Settings.");
  return connection;
}
async function selectedMembers(householdId: string, userIds: string[]) {
  const members = await db.user.findMany({ where: { householdId, disabledAt: null }, select: { id: true, email: true, role: true, habitant: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  if (userIds.some((id) => !members.some((member) => member.id === id))) throw new HttpError(400, "xtra_members", "Choose active accounts from this household only.");
  return members;
}
export async function xtraStatus(user: SessionUser): Promise<XtraStatus> {
  const canManage = user.role === "owner";
  let unreadable = false;
  const connection = await readXtraConnection(user.householdId).catch((error) => { if (!canManage) throw error; unreadable = true; return null; });
  const canUse = Boolean(connection?.userIds.includes(user.id));
  const visible = canManage || canUse;
  return {
    configured: secretsAvailable(), connected: Boolean(connection) && visible, canUse, canManage,
    needsReconnect: unreadable || (visible && Boolean(connection?.needsReconnect)),
    connectedAt: visible ? connection?.connectedAt ?? null : null,
    checkedAt: visible ? connection?.checkedAt ?? null : null,
    placeId: visible ? connection?.credentials.placeId ?? null : null,
    members: canManage ? (await selectedMembers(user.householdId, [])).map((member) => ({ id: member.id, name: member.habitant?.name ?? member.email, role: member.role.toLowerCase(), allowed: connection?.userIds.includes(member.id) ?? false })) : [],
  };
}
export async function connectXtra(user: SessionUser, raw: unknown, signal: AbortSignal) {
  manager(user);
  if (!secretsAvailable()) throw new HttpError(503, "xtra_not_configured", "The server needs an integration encryption key before Xtra can be connected.");
  const input = xtraConnectSchema.parse(raw);
  rate.hit(user.id);
  await withXtraLock(user.householdId, async () => {
    signal.throwIfAborted();
    await selectedMembers(user.householdId, input.userIds);
    await new XtraClient(input.credentials, signal).list(1, 0);
    const now = new Date().toISOString();
    // A verified replacement also repairs an unreadable old file after an encryption-key change.
    const previous = await readXtraConnection(user.householdId).catch(() => null);
    await saveXtraConnection(user.householdId, { version: 1, revision: randomUUID(), credentials: input.credentials, userIds: [...new Set(input.userIds)], connectedAt: now, checkedAt: now, needsReconnect: false, operations: previous?.operations ?? [] });
    snapshots.delete(user.householdId);
  });
  publish(user.householdId, "shopping.xtra_changed", { reason: "connection" });
  await audit(appActor(user), { action: "xtra.connected", targetLabel: "Xtra", summary: `Shared connection; access for ${input.userIds.length} selected accounts` });
  return xtraStatus(user);
}
export async function setXtraAccess(user: SessionUser, userIds: string[]) {
  manager(user);
  await withXtraLock(user.householdId, async () => {
    await selectedMembers(user.householdId, userIds);
    const connection = await readXtraConnection(user.householdId);
    if (!connection) throw new HttpError(409, "xtra_not_connected", "Connect Xtra before assigning access.");
    connection.userIds = [...new Set(userIds)];
    await saveXtraConnection(user.householdId, connection);
  });
  await audit(appActor(user), { action: "xtra.access_changed", targetLabel: "Xtra", summary: `Access for ${userIds.length} selected accounts` });
  publish(user.householdId, "shopping.xtra_changed", { reason: "access" });
  return xtraStatus(user);
}
export async function disconnectXtra(user: SessionUser) {
  manager(user);
  await withXtraLock(user.householdId, async () => { await deleteXtraConnection(user.householdId); snapshots.delete(user.householdId); });
  publish(user.householdId, "shopping.xtra_changed", { reason: "connection" });
  for (const [key, offer] of offers) if (offer.householdId === user.householdId) offers.delete(key);
  await audit(appActor(user), { action: "xtra.disconnected", targetLabel: "Xtra" });
}

async function useConnection<T>(user: SessionUser, signal: AbortSignal, run: (connection: XtraConnection, client: XtraClient) => Promise<T>, manage = false) {
  rate.hit(user.id);
  return withXtraLock(user.householdId, async () => {
    signal.throwIfAborted();
    const connection = manage ? await readXtraConnection(user.householdId) : await permitted(user);
    if (!connection) throw new HttpError(409, "xtra_not_connected", "Connect Xtra in Settings first.");
    try {
      const result = await run(connection, new XtraClient(xtraCredentialsSchema.parse(connection.credentials), AbortSignal.any([signal, AbortSignal.timeout(45_000)])));
      connection.checkedAt = new Date().toISOString();
      connection.needsReconnect = false;
      await saveXtraConnection(user.householdId, connection);
      return result;
    } catch (error) {
      if (error instanceof HttpError && error.code === "xtra_reconnect") {
        connection.needsReconnect = true;
        await saveXtraConnection(user.householdId, connection);
      }
      throw error;
    }
  });
}
export async function checkXtra(user: SessionUser, signal: AbortSignal) {
  manager(user);
  await useConnection(user, signal, async (_connection, client) => { await client.list(1, 0); }, true);
  return xtraStatus(user);
}
export async function searchXtra(user: SessionUser, raw: unknown, signal: AbortSignal) {
  const input = xtraSearchSchema.parse(raw);
  return useConnection(user, signal, async (connection, client) => {
    const products = await client.search(input.query);
    const codes = products.flatMap((product) => !product.barcode ? [] : [product.barcode, ...(product.barcode.length === 13 ? [`0${product.barcode}`, ...(product.barcode.startsWith("0") ? [product.barcode.slice(1)] : [])] : [])]);
    const known = products.length ? await db.product.findMany({
      where: { householdId: user.householdId, OR: [{ colruytProductId: { in: products.map((product) => product.productId) } }, { barcode: { in: codes } }] },
      select: { id: true, name: true, barcode: true, colruytProductId: true },
    }) : [];
    for (const [key, offer] of offers) if (offer.expiresAt <= Date.now()) offers.delete(key);
    const own = [...offers.entries()].filter(([, offer]) => offer.userId === user.id);
    for (const [key] of own.slice(0, Math.max(0, own.length - 75))) offers.delete(key);
    const results = products.map((product): XtraProduct => {
      const match = known.find((row) => row.colruytProductId === product.productId || (product.barcode && row.barcode && normalizeBarcode(row.barcode) === product.barcode));
      const value = { ...product, offer: `xt-${randomBytes(12).toString("hex")}`, existingProduct: match ? { id: match.id, name: match.name } : null };
      offers.set(value.offer, { householdId: user.householdId, userId: user.id, revision: connection.revision, expiresAt: Date.now() + 15 * 60_000, product: value });
      return value;
    });
    return { products: results, placeId: connection.credentials.placeId, observedAt: new Date().toISOString() };
  });
}
function observedProduct(user: SessionUser, connection: XtraConnection, token: string) {
  const offer = offers.get(token);
  if (!offer || offer.userId !== user.id || offer.householdId !== user.householdId || offer.revision !== connection.revision || offer.expiresAt <= Date.now()) throw new HttpError(409, "xtra_offer_expired", "Search for the product again before adding it to the Xtra list.");
  return offer.product;
}
export async function xtraAdditionPreview(user: SessionUser, token: string) {
  return observedProduct(user, await permitted(user), token);
}
export async function listXtra(user: SessionUser, raw: unknown, signal: AbortSignal) {
  const input = xtraListSchema.parse(raw);
  return useConnection(user, signal, async (connection, client) => {
    const items = await client.list(input.limit, input.offset);
    const key = itemKey(user), old = observedItems.get(key);
    const remembered = old?.revision === connection.revision && old.expiresAt > Date.now() ? old.items : new Map<string, XtraListItem>();
    if (remembered.size + items.length > 1000) remembered.clear();
    for (const item of items) remembered.set(item.id, item);
    observedItems.set(key, { revision: connection.revision, expiresAt: Date.now() + 15 * 60_000, items: remembered });
    return { items, nextOffset: items.length >= input.limit ? input.offset + input.limit : null, placeId: connection.credentials.placeId, observedAt: new Date().toISOString() };
  });
}
/** Shared short-lived cache; access is rechecked inside the connection lock before every cache hit. */
export async function snapshotXtra(user: SessionUser, signal: AbortSignal, fresh = false): Promise<XtraListSnapshot> {
  return useConnection(user, signal, async (connection, client) => {
    const cached = snapshots.get(user.householdId);
    if (!fresh && cached?.revision === connection.revision && cached.expiresAt > Date.now()) return cached.value;
    snapshots.delete(user.householdId);
    const items = new Map<string, XtraListItem>();
    let truncated = true;
    for (let offset = 0; offset < 5100; offset += 255) {
      const page = await client.list(255, offset);
      for (const item of page) items.set(item.id, item);
      if (page.length < 255) { truncated = false; break; }
    }
    const value: XtraListSnapshot = { items: [...items.values()], placeId: connection.credentials.placeId, observedAt: new Date().toISOString(), truncated };
    snapshots.set(user.householdId, { revision: connection.revision, expiresAt: Date.now() + 15_000, value });
    return value;
  });
}
async function mutate<T>(user: SessionUser, connection: XtraConnection, operationId: string, payload: unknown, write: () => Promise<T>): Promise<T> {
  if (user.role === "child") throw forbidden("Children can search Xtra but cannot change its shopping list.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ user: user.id, revision: connection.revision, payload })).digest("hex");
  const previous = connection.operations.find((operation) => operation.id === operationId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new HttpError(409, "xtra_operation_conflict", "This operation ID was already used for a different change.");
    if (previous.state === "done") return previous.result as T;
    throw new HttpError(409, "xtra_write_uncertain", "This change may already have happened. Inspect the Xtra list before starting a new operation.");
  }
  // Keep incomplete operations: evicting one would make a retry unsafe after a lost response.
  if (connection.operations.length >= 10000) throw new HttpError(409, "xtra_operation_limit", "The Xtra operation journal is full. Ask the server administrator to archive it before making more changes.");
  const operation: XtraConnection["operations"][number] = { id: operationId, fingerprint, state: "pending" };
  connection.operations.push(operation);
  await saveXtraConnection(user.householdId, connection);
  snapshots.delete(user.householdId);
  try {
    const result = await write();
    operation.state = "done"; operation.result = result;
    await saveXtraConnection(user.householdId, connection);
    return result;
  } catch (error) {
    operation.state = "uncertain";
    if (error instanceof HttpError && error.code === "xtra_reconnect") connection.needsReconnect = true;
    await saveXtraConnection(user.householdId, connection);
    throw new HttpError(409, "xtra_write_uncertain", "The Xtra change could not be verified and may already have happened. Inspect the list before retrying; reconnect in Settings if Colruyt requests login.");
  } finally {
    snapshots.delete(user.householdId);
    publish(user.householdId, "shopping.xtra_changed", { reason: "list" });
  }
}
export async function addXtra(user: SessionUser, raw: unknown, signal: AbortSignal) {
  const input = xtraAddSchema.parse(raw);
  return useConnection(user, signal, async (connection, client) => {
    // A completed replay does not depend on the short-lived product observation.
    const previous = connection.operations.find((operation) => operation.id === input.operationId);
    const product = previous ? null : observedProduct(user, connection, input.offer);
    if (product && product.unit !== "P") throw new HttpError(400, "xtra_unit", "This product isn't sold in whole pieces. Add weighted products directly in Xtra.");
    return mutate(user, connection, input.operationId, { action: "add", offer: input.offer, quantity: input.quantity }, () => client.add(input.operationId, product!, input.quantity));
  });
}
export async function removeXtra(user: SessionUser, raw: unknown, signal: AbortSignal) {
  const input = xtraRemoveSchema.parse(raw);
  return useConnection(user, signal, async (connection, client) => {
    const previous = connection.operations.find((operation) => operation.id === input.operationId);
    const observed = observedItems.get(itemKey(user));
    if (!previous && (!observed || observed.revision !== connection.revision || observed.expiresAt <= Date.now() || !observed.items.has(input.itemId))) throw new HttpError(409, "xtra_item_expired", "Read the Xtra shopping list again before removing an item.");
    return mutate(user, connection, input.operationId, { action: "remove", itemId: input.itemId }, async () => { await client.remove(input.itemId); return { removed: input.itemId }; });
  });
}
export async function xtraRemovalPreview(user: SessionUser, itemId: string) {
  const connection = await permitted(user);
  const observation = observedItems.get(itemKey(user));
  const item = observation?.items.get(itemId);
  if (!item || observation?.revision !== connection.revision || observation.expiresAt <= Date.now()) throw new HttpError(409, "xtra_item_expired", "Read the Xtra list again before removing this item.");
  return item;
}
