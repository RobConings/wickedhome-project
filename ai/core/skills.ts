import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Role } from "@/features/auth/types/auth";
import type { Locale } from "@/types/common";
import { escapeRegex, stem, words } from "./text-match";
import { estimateTokens } from "./tokens";

/**
 * Skills: the assistant's knowledge, one per area of the app (tasks, expenses, places…). A skill bundles a
 * one-line summary (always in the system prompt, so the model knows the area exists), keywords for intent
 * routing (NL + EN), a short guide (concepts, rules, flows, pitfalls; in the prompt only while the skill is
 * active) and its tools (tools name their skill). Only the tools of active skills are sent to the model,
 * which keeps every request small. See ai/README.md.
 *
 *   // ai/skills/tasks/tools.ts
 *   registerAssistantSkill({
 *     id: "tasks",
 *     title: { en: "Tasks", nl: "Taken" },
 *     summary: "Household to-dos and chores: list, add, complete, assign, snooze.",
 *     keywords: { nl: ["taak", "taken", "klusje", "afvinken"], en: ["task", "todo", "chore"] },
 *   });                                  // the guide is ai/skills/tasks/guide.md
 *
 * The registry knows no skill: ai/skills/index.ts imports every skill once at startup.
 */

export type AssistantSkillDefinition = {
  /** Lowercase id, also the folder name under ai/skills (`tasks`, `expenses`, `places`). */
  id: string;
  /** For people: the capabilities page and "what can you do". */
  title: Record<Locale, string>;
  /** One line for the model: what the area covers. Shown in every request's skill index. */
  summary: string;
  /**
   * Words that route a message to this skill before the model is called. Stems match plurals and
   * inflections ("taak" also matches "taken"); multi-word phrases match in order. Accents and case don't
   * matter. Prefer specific words: "betalen", "factuur" for expenses, not "geld" everywhere.
   */
  keywords: { nl: string[]; en: string[] };
  /**
   * Words that only hint at this skill because other areas use them too (dates, "when"): they route a
   * message that has nothing stronger, at half weight, and never make a part of a message a question of
   * its own (routeParts). Calendar: "morgen", "vandaag", "wanneer", weekdays.
   */
  hints?: { nl: string[]; en: string[] };
  /** The model's documentation (markdown, ≤ ~400 tokens). Default: `ai/skills/<id>/guide.md`. */
  guide?: string;
  /** Who gets this skill. Default: everyone; tools still filter by their own roles. */
  roles?: readonly Role[];
};

export type RegisteredAssistantSkill = Omit<AssistantSkillDefinition, "guide" | "roles"> & {
  guide: string;
  roles: readonly Role[];
  /** Stemmed keywords, ready for matching: each is a list of word stems. */
  keywordStems: string[][];
  /** Stemmed hints (weak keywords). */
  hintStems: string[][];
};

const SKILL_ID = /^[a-z][a-z0-9-]*$/;
const ALL_ROLES: readonly Role[] = ["owner", "adult", "child"];
/** Hard limit for a guide; the test suite keeps every guide under ~450 estimated tokens. */
export const GUIDE_TOKEN_LIMIT = 700;

const skills = new Map<string, RegisteredAssistantSkill>();

/** The repo root that holds `ai/skills` (works from ai/core in development and from dist/ in production). */
function findAiRoot(): string | null {
  let dir = import.meta.dirname;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(path.join(dir, "ai", "skills"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return existsSync(path.join(process.cwd(), "ai", "skills")) ? process.cwd() : null;
}

let aiRoot: string | null | undefined;
/** `ai/skills/<id>/guide.md`, or null when there is none. */
export function readSkillGuide(id: string): string | null {
  aiRoot ??= findAiRoot();
  if (!aiRoot) return null;
  const file = path.join(aiRoot, "ai", "skills", id, "guide.md");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

/** Registers a skill. Throws on a bad id, a missing or too long guide. Re-registering replaces it. */
export function registerAssistantSkill(definition: AssistantSkillDefinition): RegisteredAssistantSkill {
  const { id } = definition;
  if (!SKILL_ID.test(id)) throw new Error(`Assistant skill "${id}" must be lowercase letters, digits and dashes`);
  if (!definition.summary.trim()) throw new Error(`Assistant skill "${id}" needs a summary`);
  const guide = (definition.guide ?? readSkillGuide(id))?.trim();
  if (!guide) throw new Error(`Assistant skill "${id}" needs a guide (ai/skills/${id}/guide.md)`);
  if (estimateTokens(guide) > GUIDE_TOKEN_LIMIT) throw new Error(`Assistant skill "${id}": the guide is too long (keep it under ~400 tokens)`);
  const toStems = (list: string[]) => list.map((keyword) => words(keyword).map(stem)).filter((stems) => stems.length > 0);
  const skill: RegisteredAssistantSkill = {
    id,
    title: definition.title,
    summary: definition.summary.trim(),
    keywords: definition.keywords,
    ...(definition.hints && { hints: definition.hints }),
    guide,
    roles: definition.roles ?? ALL_ROLES,
    keywordStems: toStems([...definition.keywords.nl, ...definition.keywords.en]),
    hintStems: toStems([...(definition.hints?.nl ?? []), ...(definition.hints?.en ?? [])]),
  };
  skills.set(id, skill);
  return skill;
}

export const getAssistantSkill = (id: string) => skills.get(id);
export const listAssistantSkills = (): RegisteredAssistantSkill[] => [...skills.values()].sort((a, b) => a.id.localeCompare(b.id));
export const skillsForRole = (role: Role) => listAssistantSkills().filter((skill) => skill.roles.includes(role));
/** Tests only. */
export const unregisterAssistantSkill = (id: string) => skills.delete(id);

// ── Intent routing ────────────────────────────────────────────────────────────────────────────────────

/** `strong`: at least one real keyword matched (not only hints). */
export type SkillMatch = { id: string; score: number; strong: boolean };

/** Whether `stems` contains the keyword's stems in order (a keyword stem may be a prefix of a word stem). */
function keywordHits(textStems: string[], keyword: string[]): boolean {
  const first = keyword[0];
  if (!first) return false;
  const matchesWord = (word: string | undefined, key: string) => word !== undefined && (word === key || (key.length >= 4 && word.startsWith(key)));
  for (let index = 0; index < textStems.length; index += 1) {
    if (!matchesWord(textStems[index], first)) continue;
    if (keyword.every((key, offset) => matchesWord(textStems[index + offset], key))) return true;
  }
  return false;
}

/** Longer and multi-word keywords are more specific, so they weigh more. */
const keywordScore = (keyword: string[]) => keyword.join(" ").length + 2 * (keyword.length - 1);

/** Every skill a text matches, best first (hints count half). */
function scoreSkills(text: string, candidates: RegisteredAssistantSkill[]): SkillMatch[] {
  const textStems = words(text).map(stem);
  if (!textStems.length) return [];
  const matches: SkillMatch[] = [];
  for (const skill of candidates) {
    let strong = 0;
    let hint = 0;
    for (const keyword of skill.keywordStems) if (keywordHits(textStems, keyword)) strong += keywordScore(keyword);
    for (const keyword of skill.hintStems) if (keywordHits(textStems, keyword)) hint += keywordScore(keyword);
    const score = strong + Math.ceil(hint / 2);
    if (score > 0) matches.push({ id: skill.id, score, strong: strong > 0 });
  }
  return matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Whether a text matches one of the skill's keywords (not hints): e.g. an answer that talks about the weather. */
export function mentionsSkill(text: string, skill: RegisteredAssistantSkill): boolean {
  const textStems = words(text).map(stem);
  return skill.keywordStems.some((keyword) => keywordHits(textStems, keyword));
}

/**
 * The skills a message is about, best first: each matched keyword scores its length (longer and multi-word
 * keywords are more specific; hints half). At most `limit`; a second skill only when it scores at least half
 * the first. A message with several questions is better served by `routeParts` / `routeIntents`.
 */
export function routeMessage(text: string, candidates: RegisteredAssistantSkill[] = listAssistantSkills(), limit = 2): SkillMatch[] {
  const matches = scoreSkills(text, candidates);
  const best = matches[0]?.score ?? 0;
  return matches.filter((match, index) => index === 0 || match.score * 2 >= best).slice(0, limit);
}

/** Words that start a new question after a comma ("…, welke vuilbak moet buiten"). */
const QUESTION_WORDS =
  "wat|welke|welk|wie|waar|wanneer|hoe|hoeveel|waarom|is|zijn|staat|staan|heb|hebben|heeft|moet|moeten|kan|kunnen|gaat|wordt|komt|zit|ligt|" +
  "what|what's|whats|which|who|where|when|how|why|is|are|was|do|does|did|have|has|can|could|will|would|should";

/**
 * Where one question or request ends and the next begins: ?, !, ;, the end of a sentence, a joining word
 * ("en", "and", "ook", "also", "plus", "daarna", "then"), or a comma before a question word. A comma before
 * anything else usually continues the same request ("Haal het etentje uit de agenda, het gaat niet door"),
 * and "12,50" has no space.
 */
const PART_BOUNDARY = new RegExp(`[?!;]+|\\.\\s+|,\\s+(?=(?:${QUESTION_WORDS})\\b)|\\s+(?:en|and|ook|also|plus|daarna|daarnaast|verder|then)\\s+`, "i");

export type MessagePart = { text: string; matches: SkillMatch[] };

const JOINING_WORD = /\s+(en|and|ook|also|plus|then)\s+/i;

/** Keeps keywords with a joining word in them whole ("inkomsten en uitgaven", "income and expenses"). */
function protectPhrases(text: string, candidates: RegisteredAssistantSkill[]): string {
  let result = text;
  for (const skill of candidates) {
    for (const phrase of [...skill.keywords.nl, ...skill.keywords.en]) {
      if (!JOINING_WORD.test(phrase)) continue;
      const pattern = new RegExp(escapeRegex(phrase).replace(/\s+/g, "\\s+"), "gi");
      result = result.replace(pattern, (match) => match.replace(new RegExp(JOINING_WORD.source, "gi"), "_$1_"));
    }
  }
  return result;
}

/** The parts of a message (split at PART_BOUNDARY) that match a skill, in the order written, each with its matches. */
export function routeParts(text: string, candidates: RegisteredAssistantSkill[] = listAssistantSkills()): MessagePart[] {
  return protectPhrases(text, candidates)
    .split(PART_BOUNDARY)
    .map((part) => part.replace(/_(en|and|ook|also|plus|then)_/gi, " $1 ").replace(/^[\s,]+|[\s,]+$/g, ""))
    .filter(Boolean)
    .flatMap((part) => {
      const matches = scoreSkills(part, candidates);
      return matches.length ? [{ text: part, matches }] : [];
    });
}

/**
 * The questions in a message, as skills in the order asked: the best skill of every part that matches a real
 * keyword. "Wat is de volgende betaling en wat is het weer morgen?" → expenses, weather, even though the
 * weather part scores far lower than the whole message's best match. At most `limit`, no duplicates.
 */
export function routeIntents(text: string, candidates: RegisteredAssistantSkill[] = listAssistantSkills(), limit = 3): string[] {
  const ids: string[] = [];
  for (const part of routeParts(text, candidates)) {
    const best = part.matches.find((match) => match.strong);
    if (best && !ids.includes(best.id)) ids.push(best.id);
  }
  return ids.slice(0, limit);
}
