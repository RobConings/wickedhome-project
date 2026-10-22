import type { Role } from "@/features/auth/types/auth";
import { listEntityResolvers, scoreCandidates, type EntityCandidate } from "./resolve";
import type { AssistantToolContext } from "./tools";

/**
 * `search_everything`: one search across the household's things (people, rooms, tasks, payees, projects,
 * documents…). Every entity resolver with `searchable` (the default) takes part automatically; a skill with
 * its own search (full text in documents, notes in tasks) registers a source:
 *
 *   registerSearchSource({
 *     id: "documents", type: "document", skill: "documents",
 *     search: async (ctx, query, limit) => (await searchDocuments(ctx.user, query, limit)).map((doc) => ({
 *       id: doc.id, title: doc.name, hint: doc.folderName, score: 70 })),
 *   });
 *
 * Hits are short: type, id (for a follow-up call), title, a hint and the skill to load for more.
 */

export type SearchHit = { type: string; id: string; title: string; hint?: string; date?: string; skill?: string; score?: number };

export type SearchSource = {
  id: string;
  /** The kind of thing it finds, as the model reads it ("document", "task"). */
  type: string;
  skill?: string;
  roles?: readonly Role[];
  search: (ctx: AssistantToolContext, query: string, limit: number) => Promise<SearchHit[]>;
};

const sources = new Map<string, SearchSource>();

export const registerSearchSource = (source: SearchSource) => void sources.set(source.id, source);
export const listSearchSources = () => [...sources.values()];
/** Tests only. */
export const unregisterSearchSource = (id: string) => sources.delete(id);

const SOURCE_TIMEOUT_MS = 4000;

const withTimeout = <T>(promise: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), SOURCE_TIMEOUT_MS).unref?.())]);

/** Searches every source this person may use, in parallel; best hits first, at most `limit`. */
export async function searchEverything(ctx: AssistantToolContext, query: string, options: { types?: string[]; limit?: number } = {}): Promise<{ hits: SearchHit[]; more: number }> {
  const limit = options.limit ?? 12;
  const wanted = options.types?.length ? new Set(options.types) : null;
  const allowed = (roles: readonly Role[] | undefined) => !roles || roles.includes(ctx.user.role);

  const fromResolvers = listEntityResolvers()
    .filter((resolver) => resolver.searchable !== false && allowed(resolver.roles) && (!wanted || wanted.has(resolver.type)))
    .map(async (resolver) => {
      const candidates: EntityCandidate[] = resolver.search ? await resolver.search(ctx, query) : resolver.list ? await resolver.list(ctx) : [];
      return scoreCandidates(query, candidates).map(({ candidate, score }) => ({
        type: resolver.type,
        id: candidate.id,
        title: candidate.name,
        ...(candidate.hint && { hint: candidate.hint }),
        ...(candidate.date && { date: candidate.date }),
        ...(resolver.skill && { skill: resolver.skill }),
        score,
      }));
    });
  const fromSources = listSearchSources()
    .filter((source) => allowed(source.roles) && (!wanted || wanted.has(source.type)))
    .map(async (source) => (await source.search(ctx, query, limit)).map((hit) => ({ ...hit, type: hit.type || source.type, skill: hit.skill ?? source.skill, score: hit.score ?? 50 })));

  const settled = await Promise.all(
    [...fromResolvers, ...fromSources].map((promise) =>
      withTimeout(
        promise.catch((error: unknown) => {
          console.error("Assistant search source failed", error);
          return [] as SearchHit[];
        }),
        [] as SearchHit[],
      ),
    ),
  );
  const seen = new Set<string>();
  const hits = settled
    .flat()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.title.localeCompare(b.title))
    .filter((hit) => {
      const key = `${hit.type}:${hit.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { hits: hits.slice(0, limit).map(({ score: _score, ...hit }) => hit), more: Math.max(0, hits.length - limit) };
}
