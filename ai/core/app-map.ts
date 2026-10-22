import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Locale } from "@/types/common";
import { fold, stem, words } from "./text-match";

/**
 * What the app looks like to a person, for `app_help` ("waar vind ik…", "how does … work") and for skills that
 * show app texts (job titles, notification kinds). Nothing here is hand-copied: it is read from the code at
 * runtime (cached), the same files the browser is built from:
 *
 * - `appText("integrations:jobs.google-mail.title", "nl")`: an i18n key (`namespace:key`) from
 *   `src/features/<namespace>/locales/<lang>.json` (`common`: `src/locales/<lang>.json`);
 * - `appPages(locale)`: the page map, from the navigation in `src/app/app-frame.tsx`, the sections of the
 *   Settings page (`src/features/settings/screens/settings-screen.tsx`, `src/routes/settings.tsx`) and the
 *   fixed sub-pages in `src/app/router.tsx`, labelled with the app's own translations;
 * - `appNotes()`: short "how it works" notes per area (`ai/core/app-notes.md`, ≤ ~80 tokens each).
 *
 * All of it is lazy: only `app_help` returns it, on demand; none of it is in the system prompt.
 */

let rootDir: string | null | undefined;
/** The repo root (holds `src/app` and `ai/core`), from ai/core in development and from dist/ in production. */
function appRoot(): string | null {
  if (rootDir !== undefined) return rootDir;
  let dir = import.meta.dirname;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(path.join(dir, "src", "app")) && existsSync(path.join(dir, "ai", "core"))) return (rootDir = dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return (rootDir = existsSync(path.join(process.cwd(), "src", "app")) ? process.cwd() : null);
}

const files = new Map<string, string | null>();
/** A file of the repo as text (cached), or null when it isn't there. */
function readRepoFile(...parts: string[]): string | null {
  const root = appRoot();
  if (!root) return null;
  const file = path.join(root, ...parts);
  if (!files.has(file)) files.set(file, existsSync(file) ? readFileSync(file, "utf8") : null);
  return files.get(file) ?? null;
}

const catalogs = new Map<string, Record<string, unknown> | null>();
function catalog(namespace: string, locale: Locale): Record<string, unknown> | null {
  const key = `${namespace}:${locale}`;
  if (!catalogs.has(key)) {
    const text = namespace === "common" ? readRepoFile("src", "locales", `${locale}.json`) : readRepoFile("src", "features", namespace, "locales", `${locale}.json`);
    let parsed: Record<string, unknown> | null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    catalogs.set(key, parsed);
  }
  return catalogs.get(key) ?? null;
}

/** The app's text for an i18n key (`namespace:dotted.key`, or `dotted.key` in `common`), or null. */
export function appText(key: string, locale: Locale): string | null {
  const [namespace, dotted] = key.includes(":") ? (key.split(":", 2) as [string, string]) : ["common", key];
  if (!/^[a-z][a-z0-9-]*$/.test(namespace)) return null;
  let node: unknown = catalog(namespace, locale);
  for (const part of dotted.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
}

// ── Pages ─────────────────────────────────────────────────────────────────────────────────────────────

export type AppPage = { name: string; path: string };

/** `const { t: tAuth } = useTranslation("auth")` → tAuth → auth (and `t` → its namespace). */
function translatorNamespaces(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of source.matchAll(/const \{ t(?::\s*(\w+))? \} = useTranslation\(\s*(?:"([\w-]+)")?\s*\)/g)) map.set(match[1] ?? "t", match[2] ?? "common");
  return map;
}

/** Nav items, Settings sections and fixed sub-pages, labelled in `locale`. */
function buildPages(locale: Locale): AppPage[] {
  const pages: AppPage[] = [];
  const frame = readRepoFile("src", "app", "app-frame.tsx") ?? "";
  const navT = translatorNamespaces(frame);
  for (const match of frame.matchAll(/\{\s*to:\s*"(\/[^"]*)",\s*label:\s*(\w+)\("([^"]+)"\)/g)) {
    const [, to, fn, key] = match as unknown as [string, string, string, string];
    const name = appText(`${navT.get(fn) ?? "common"}:${key}`, locale);
    if (name) pages.push({ name, path: to });
  }
  const top = new Map(pages.map((page) => [page.path.split("/")[1] ?? "", page.name]));

  const settingsName = top.get("settings") ?? "Settings";
  for (const file of [
    ["src", "features", "settings", "screens", "settings-screen.tsx"],
    ["src", "routes", "settings.tsx"],
  ]) {
    const source = readRepoFile(...file) ?? "";
    const translators = translatorNamespaces(source);
    for (const match of source.matchAll(/id:\s*"([\w-]+)",\s*icon:\s*\w+,\s*title:\s*(\w+)\("([^"]+)"\)/g)) {
      const [, id, fn, key] = match as unknown as [string, string, string, string];
      const title = appText(`${translators.get(fn) ?? "common"}:${key}`, locale);
      if (title) pages.push({ name: `${settingsName} › ${title}`, path: `/settings#${id}` });
    }
  }

  const router = readRepoFile("src", "app", "router.tsx") ?? "";
  for (const match of router.matchAll(/path:\s*"([a-z-]+\/[a-z-/]+)"/g)) {
    const sub = match[1] ?? "";
    const [first, ...rest] = sub.split("/");
    const parent = top.get(first ?? "");
    if (parent && !pages.some((page) => page.path === `/${sub}`)) pages.push({ name: `${parent} › ${rest.join(" ").replace(/-/g, " ")}`, path: `/${sub}` });
  }
  return pages;
}

const pageCache = new Map<Locale, AppPage[]>();
/** Every page a person can open, in their language: "Taken" → /tasks, "Instellingen › Automatiseringen" → /settings#automations. */
export function appPages(locale: Locale): AppPage[] {
  if (!pageCache.has(locale)) pageCache.set(locale, buildPages(locale));
  return pageCache.get(locale) ?? [];
}

// ── Notes ─────────────────────────────────────────────────────────────────────────────────────────────

export type AppNote = { title: string; keywords: string[]; text: string };

let notes: AppNote[] | undefined;
/** `## Title | keyword, keyword` sections of ai/core/app-notes.md. */
export function appNotes(): AppNote[] {
  if (notes) return notes;
  const text = readRepoFile("ai", "core", "app-notes.md") ?? "";
  notes = text
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [head = "", ...body] = section.split("\n");
      const [title = "", keys = ""] = head.split("|");
      return { title: title.trim(), keywords: keys.split(",").map((key) => key.trim()).filter(Boolean), text: body.join("\n").trim() };
    })
    .filter((note) => note.title && note.text);
  return notes;
}

const stemsOf = (value: string) => words(value).map(stem).filter((word) => word.length >= 3);

/** How well a text matches a query: shared word stems (a 4+ letter stem may be a prefix), longer ones count more. */
function overlap(query: string[], text: string): number {
  const target = stemsOf(text);
  let score = 0;
  for (const word of query) if (target.some((other) => other === word || (word.length >= 4 && other.startsWith(word)) || (other.length >= 4 && word.startsWith(other)))) score += word.length;
  return score;
}

const STOP = new Set(["waar", "vind", "where", "find", "how", "hoe", "werkt", "work", "does", "the", "het", "een", "van", "app", "page", "pagina", "kan", "can", "ik", "wat", "what", "doe", "zet", "mijn", "the", "and", "en", "die", "dat", "this", "with", "met"]);

/** The best notes and pages for a topic ("facturen uit gmail", "where are the automations"). */
export function findInApp(topic: string, locale: Locale): { pages: AppPage[]; notes: AppNote[] } {
  const query = stemsOf(topic).filter((word) => !STOP.has(fold(word)));
  if (!query.length) return { pages: [], notes: [] };
  const rank = <T>(items: T[], text: (item: T) => string, limit: number) =>
    items
      .map((item) => ({ item, score: overlap(query, text(item)) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.item);
  const foundNotes = rank(appNotes(), (note) => `${note.title} ${note.keywords.join(" ")}`, 2);
  // Page names in both languages ("instellingen" finds Settings for an English speaker too).
  const other = new Map(appPages(locale === "nl" ? "en" : "nl").map((page) => [page.path, page.name]));
  const pageText = (page: AppPage) => `${page.name} ${other.get(page.path) ?? ""} ${page.path.replace(/[/#-]/g, " ")}`;
  let pages = rank(appPages(locale), pageText, 4);
  // "stille uren" names no page but finds the Notifications note: its pages are the answer.
  if (!pages.length && foundNotes[0]) {
    const noteWords = stemsOf(`${foundNotes[0].title} ${foundNotes[0].keywords.join(" ")}`);
    pages = appPages(locale)
      .map((page) => ({ page, score: overlap(noteWords, pageText(page)) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.page);
  }
  return { pages, notes: foundNotes };
}

/** Tests only. */
export function resetAppMapCache(): void {
  files.clear();
  catalogs.clear();
  pageCache.clear();
  notes = undefined;
}
