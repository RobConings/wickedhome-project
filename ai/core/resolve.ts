import { z } from "zod";
import type { Role } from "@/features/auth/types/auth";
import { todayIn } from "@/types/dates";
import { fold, nameScore, splitDate } from "./text-match";
import type { AssistantToolContext } from "./tools";

/**
 * Entity resolvers: tools take human names ("Clara", "ik", "de keuken", "Fluvius", "gezamenlijke rekening")
 * instead of ids. A tool declares an argument with `entityRef("habitant")`; the model sends a name or an id;
 * before the tool runs (and before its confirmation text is written) the runner resolves it with fuzzy
 * matching (case, accents, partial names, plurals, small typos) and hands the tool a `ResolvedEntity`
 * (`{ type, id, name, hint?, data? }`). Ambiguous or unknown names go back to the model as a clear message
 * ("Which person: Jan Peeters or Jan De Smet?") instead of an error.
 *
 *   input: z.object({ assignee: entityRef("habitant").optional(), room: entityRef("place").optional() }),
 *   run: (ctx, input) => createTask(ctx.householdId, { assigneeIds: input.assignee ? [input.assignee.id] : [], … })
 *
 * Skills register the resolver of their entity type (registry pattern; this file knows no feature):
 *
 *   registerEntityResolver({
 *     type: "shop", label: "shop", skill: "shopping",
 *     list: async (ctx) => (await listShops(ctx.householdId)).map((shop) => ({ id: shop.id, name: shop.name, hint: shop.type })),
 *   });
 *
 * `list` suits small sets (cached for 30 s per person, dropped after every write); `search(ctx, query)` suits
 * big ones (tasks, events, documents): return a few dozen candidates and the matcher ranks them. Resolvers
 * also feed `search_everything` unless `searchable: false`.
 */

/**
 * The entity types tools can refer to by name. A skill adding a type adds it here (one line), then
 * registers its resolver from its own ai/skills/<skill>/tools.ts.
 */
export const ENTITY_TYPES = [
  "habitant",
  "place",
  "floor",
  "shop",
  "payee",
  "recurring_expense",
  "expense",
  "account",
  "income_source",
  "project",
  "task",
  "event",
  "product",
  "stock_item",
  "shopping_list",
  "shopping_item",
  "staple",
  "device",
  "appliance",
  "document",
  "folder",
  "subscription",
  "automation",
  "notification_kind",
  "mail_suggestion",
  "contact",
  "recipe",
  "recipe_category",
  "meal",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** One thing a name may refer to. */
export type EntityCandidate = {
  id: string;
  /** The name people use ("Keuken", "Fluvius", "Vuilnisbakken buiten"). */
  name: string;
  /** Other names that should match ("living", "woonkamer"; a payee's former name; a nickname). */
  aliases?: string[];
  /** Tells apart candidates with the same name, shown in "which one?" questions ("Gelijkvloers", "05/10/2026"). */
  hint?: string;
  /** `YYYY-MM-DD` for dated things (tasks, events): a date in the query picks the right one. */
  date?: string | null;
  /** The person asking (habitants): "ik", "me", "mij", "myself" resolve to it. */
  self?: boolean;
  /** Extra fields the tool may need after resolving (kept small). */
  data?: Record<string, unknown>;
};

/** What a tool receives for an `entityRef` argument. */
export type ResolvedEntity = { type: EntityType; id: string; name: string; hint?: string; data?: Record<string, unknown> };

export type EntityResolver = {
  type: EntityType;
  /** Model-facing English noun for messages: "person", "room", "payment account". */
  label: string;
  /** The skill that owns this type (search hits say which skill to load). */
  skill?: string;
  /** Who may resolve and search this type (accounts: owners and adults). Default: everyone. */
  roles?: readonly Role[];
  /** Small sets: every candidate (cached 30 s per person). */
  list?: (ctx: AssistantToolContext) => Promise<EntityCandidate[]>;
  /** Big sets: candidates for a query (already narrowed by the feature; the matcher ranks them). */
  search?: (ctx: AssistantToolContext, query: string) => Promise<EntityCandidate[]>;
  /** Feed `search_everything` (default true). */
  searchable?: boolean;
};

const resolvers = new Map<EntityType, EntityResolver>();

export function registerEntityResolver(resolver: EntityResolver): void {
  if (!resolver.list && !resolver.search) throw new Error(`Entity resolver "${resolver.type}" needs list or search`);
  resolvers.set(resolver.type, resolver);
}
export const getEntityResolver = (type: EntityType) => resolvers.get(type);
export const listEntityResolvers = () => [...resolvers.values()];
/** Tests only. */
export const unregisterEntityResolver = (type: EntityType) => resolvers.delete(type);

// ── Candidate cache ───────────────────────────────────────────────────────────────────────────────────

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; items: Promise<EntityCandidate[]> }>();

async function candidatesOf(resolver: EntityResolver, ctx: AssistantToolContext, query: string): Promise<EntityCandidate[]> {
  if (resolver.search) return resolver.search(ctx, query);
  const key = `${ctx.householdId}:${ctx.user.id}:${resolver.type}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  const items = resolver.list!(ctx);
  cache.set(key, { at: Date.now(), items });
  items.catch(() => cache.delete(key));
  return items;
}

/** Forget cached candidates of a household (the runner calls it after every successful write). */
export function invalidateEntityCache(householdId?: string): void {
  if (!householdId) return cache.clear();
  for (const key of cache.keys()) if (key.startsWith(`${householdId}:`)) cache.delete(key);
}

// ── Matching ──────────────────────────────────────────────────────────────────────────────────────────

/** Words that mean the person asking. */
export const SELF_WORDS = new Set(["ik", "me", "mij", "mezelf", "mijzelf", "myself", "i", "mine", "mijn", "zelf", "self"]);

export type ScoredCandidate = { candidate: EntityCandidate; score: number };

/** Every candidate's score for a query (0–120), best first; only those that match at all. */
export function scoreCandidates(query: string, candidates: EntityCandidate[], year = Number(todayIn().slice(0, 4))): ScoredCandidate[] {
  const raw = query.trim();
  const folded = fold(raw);
  const { text, date } = splitDate(raw, year);
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    let score = 0;
    if (candidate.id === raw) score = 120;
    else if (candidate.self && SELF_WORDS.has(folded)) score = 110;
    else {
      for (const name of [candidate.name, ...(candidate.aliases ?? [])]) score = Math.max(score, nameScore(text || raw, name));
      if (score > 0 && date && candidate.date) score += candidate.date === date ? 15 : -25;
      else if (!text && date && candidate.date === date) score = 60;
    }
    if (score >= 45) scored.push({ candidate, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
}

export type ResolveOutcome = { ok: true; entity: ResolvedEntity } | { ok: false; error: string };

const MAX_OPTIONS = 4;
const label = (candidate: EntityCandidate) => (candidate.hint ? `${candidate.name} (${candidate.hint})` : candidate.name);

/** The single best match, or a message for the model saying which ones it could be, or that none matched. */
export function pickCandidate(type: EntityType, noun: string, query: string, candidates: EntityCandidate[], listed: boolean): ResolveOutcome {
  const scored = scoreCandidates(query, candidates);
  const best = scored[0];
  if (!best) {
    const known = listed && candidates.length <= 15 ? ` Known: ${candidates.map(label).join(", ")}.` : " Try search_everything, or ask the person.";
    return { ok: false, error: candidates.length ? `No ${noun} matches "${query}".${known}` : `There is no ${noun} yet.` };
  }
  // Clear winner: an exact name/id, or well ahead of the next one.
  const close = scored.filter((entry) => entry.score >= best.score - 5);
  const exact = scored.filter((entry) => entry.score >= 100);
  const winner = exact.length === 1 ? exact[0] : close.length === 1 ? best : null;
  if (!winner) {
    const options = close.slice(0, MAX_OPTIONS).map((entry) => `"${label(entry.candidate)}"`);
    const more = close.length > MAX_OPTIONS ? ` (and ${close.length - MAX_OPTIONS} more)` : "";
    return { ok: false, error: `Which ${noun} do you mean by "${query}": ${options.join(" or ")}${more}? Ask the person, or call again with the exact name or id.` };
  }
  const { candidate } = winner;
  return { ok: true, entity: { type, id: candidate.id, name: candidate.name, ...(candidate.hint && { hint: candidate.hint }), ...(candidate.data && { data: candidate.data }) } };
}

/** Resolves a name (or id) of an entity type for this person. Never throws. */
export async function resolveEntity(ctx: AssistantToolContext, type: EntityType, query: string): Promise<ResolveOutcome> {
  const resolver = resolvers.get(type);
  if (!resolver) return { ok: false, error: `The app can't look up ${type.replace(/_/g, " ")} by name yet; use an id.` };
  if (resolver.roles && !resolver.roles.includes(ctx.user.role)) return { ok: false, error: `This person can't look up ${resolver.label}s` };
  try {
    const candidates = await candidatesOf(resolver, ctx, query);
    return pickCandidate(type, resolver.label, query, candidates, Boolean(resolver.list));
  } catch (error) {
    console.error(`Entity resolver "${type}" failed`, error);
    return { ok: false, error: `Looking up the ${resolver.label} failed` };
  }
}

/**
 * id → name of every entity of a listed type (e.g. people, for "who" in results), from the resolver's
 * cached list. Empty when the type has no `list` resolver.
 */
export async function entityNames(ctx: AssistantToolContext, type: EntityType): Promise<Map<string, string>> {
  const resolver = resolvers.get(type);
  if (!resolver?.list) return new Map();
  const candidates = await candidatesOf(resolver, ctx, "");
  return new Map(candidates.map((candidate) => [candidate.id, candidate.name]));
}

/**
 * A matcher for names of things in a question ("Fluvius", "lening huis", "Delhaize"), built from the cached
 * candidates of listed resolvers that name a skill. Routing uses it as a fallback when no keyword matched,
 * so "en Fluvius?" still activates the expenses skill. People are left out (they are in the snapshot and
 * appear in questions about every area).
 */
export async function entityMentionMatcher(ctx: AssistantToolContext): Promise<(text: string) => string[]> {
  const names: { name: string; skill: string }[] = [];
  await Promise.all(
    listEntityResolvers()
      .filter((resolver) => resolver.list && resolver.skill && resolver.type !== "habitant" && (!resolver.roles || resolver.roles.includes(ctx.user.role)))
      .map(async (resolver) => {
        try {
          for (const candidate of await candidatesOf(resolver, ctx, "")) {
            for (const name of [candidate.name, ...(candidate.aliases ?? [])]) {
              const folded = fold(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
              if (folded.length >= 4) names.push({ name: folded, skill: resolver.skill ?? "" });
            }
          }
        } catch {
          // A failing resolver only means no mention routing for its type.
        }
      }),
  );
  return (text) => {
    const folded = ` ${fold(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    return [...new Set(names.filter((entry) => folded.includes(` ${entry.name} `)).map((entry) => entry.skill))];
  };
}

// ── The zod helper ────────────────────────────────────────────────────────────────────────────────────

const PENDING = Symbol("entityRef");
type PendingRef = { [PENDING]: EntityType; query: string };

const DEFAULT_DESCRIPTIONS: Partial<Record<EntityType, string>> = {
  habitant: "Person: first name, or 'me' for the person asking",
  place: "Room or outdoor zone by name, e.g. 'keuken'",
  floor: "Floor by name, e.g. 'gelijkvloers'",
  account: "Payment account by name, e.g. 'gezamenlijke rekening'",
  task: "Task title (add the due date YYYY-MM-DD if several share a title) or id",
  event: "Event title (add the date YYYY-MM-DD if several share a title) or id",
  meal: "A meal on the 'To cook' list or being cooked: the recipe's name, or id",
};

/**
 * A tool argument naming an entity: the model sends a name or an id (a string), the tool receives a
 * `ResolvedEntity`. Works inside arrays and optional fields: `z.array(entityRef("habitant")).max(10)`.
 */
export function entityRef(type: EntityType, description?: string) {
  return z
    .string()
    .trim()
    .min(1)
    .max(160)
    .describe(description ?? DEFAULT_DESCRIPTIONS[type] ?? `${type.replace(/_/g, " ")}: name or id`)
    .transform((query): ResolvedEntity => ({ [PENDING]: type, query }) as unknown as ResolvedEntity);
}

const isPending = (value: unknown): value is PendingRef => typeof value === "object" && value !== null && PENDING in value;

/**
 * Replaces every `entityRef` value in parsed tool input with its resolved entity. All names are resolved
 * (in parallel); every problem is reported in one message so the model can fix them in one go.
 */
export async function resolveRefs<T>(ctx: AssistantToolContext, data: T): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const isPlain = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
  const pending: PendingRef[] = [];
  const collect = (value: unknown): void => {
    if (isPending(value)) pending.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (isPlain(value)) Object.values(value).forEach(collect);
  };
  collect(data);
  if (!pending.length) return { ok: true, data };

  const outcomes = await Promise.all(pending.map((ref) => resolveEntity(ctx, ref[PENDING], ref.query)));
  const errors = [...new Set(outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.error])))];
  if (errors.length) return { ok: false, error: errors.join(" ") };
  const resolved = new Map<PendingRef, ResolvedEntity>();
  outcomes.forEach((outcome, index) => {
    const ref = pending[index];
    if (outcome.ok && ref) resolved.set(ref, outcome.entity);
  });
  const replace = (value: unknown): unknown => {
    if (isPending(value)) return resolved.get(value);
    if (Array.isArray(value)) return value.map(replace);
    if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  return { ok: true, data: replace(data) as T };
}
