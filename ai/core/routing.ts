import type { Role } from "@/features/auth/types/auth";
import type { LoopMessage } from "./assistant-loop";
import { screenSkills } from "./screen-context";
import { getAssistantSkill, mentionsSkill, routeIntents, routeMessage, routeParts, skillsForRole, type RegisteredAssistantSkill } from "./skills";
import { getAssistantTool, isToolAvailable, listAssistantTools, type RegisteredAssistantTool } from "./tools";

/**
 * Which skills are active in a conversation, and so which tools and guides go into the next request.
 * Derived from the conversation itself (nothing stored):
 *
 * - every question is routed by keywords (the skill of each part of a question with several parts, plus the
 *   whole question's top 1–2), so most requests need no `skills_load` round trip;
 * - a question asked from a page (screen context) also activates that screen's skills (its main one right
 *   after the question's best keyword match);
 * - a tool that ran keeps its skill active; `skills_load` activates the skills it names;
 * - at most `MAX_ACTIVE_SKILLS` stay active: the least recently used one of earlier turns drops out first;
 *   a skill the current question asked for, or that this turn used, is never dropped.
 *
 * Active skills keep the order in which they became active, so the tools list (and the model server's
 * prompt cache) stays stable from one request to the next.
 */

export const MAX_ACTIVE_SKILLS = 3;
export const LOAD_SKILLS_TOOL = "skills.load";

export type TurnPlan = {
  skills: RegisteredAssistantSkill[];
  /** Core tools first, then the active skills' tools; only tools this person may use. */
  tools: RegisteredAssistantTool[];
};

/** The skills `skills_load` asked for in a tool message (only when it succeeded). */
function loadedBy(message: LoopMessage): string[] {
  if (message.toolName !== LOAD_SKILLS_TOOL || message.toolStatus !== "done") return [];
  const args = message.toolArgs as { skills?: unknown } | undefined;
  return Array.isArray(args?.skills) ? args.skills.filter((id): id is string => typeof id === "string") : [];
}

/** Skills this role has that come with tools of their own (skills whose tools are all core never need a slot). */
function routableSkills(role: Role): RegisteredAssistantSkill[] {
  const withOwnTools = new Set(listAssistantTools().flatMap((tool) => (tool.core || !isToolAvailable(tool) ? [] : [tool.skill])));
  return skillsForRole(role).filter((skill) => withOwnTools.has(skill.id));
}

/**
 * The skills one question activates: the skill of every part it asks about first (in the order asked), then
 * the whole question's best one or two; at most `max`. `mentions` (names of known things, "Fluvius" →
 * expenses) only when no keyword matched.
 */
export function questionSkillIds(text: string, available: RegisteredAssistantSkill[], max = MAX_ACTIVE_SKILLS, mentions?: (text: string) => string[]): string[] {
  const ids = [...new Set([...routeIntents(text, available, max), ...routeMessage(text, available).map((match) => match.id)])].slice(0, max);
  return ids.length ? ids : (mentions?.(text) ?? []).slice(0, 2);
}

/**
 * Active skill ids, oldest activation first. `mentions` (optional) names the skills of things named in a
 * question ("Fluvius" → expenses); used only when no keyword matched that question.
 */
export function activeSkillIds(history: LoopMessage[], role: Role, max = MAX_ACTIVE_SKILLS, mentions?: (text: string) => string[]): string[] {
  const available = routableSkills(role);
  const allowed = new Set(available.map((skill) => skill.id));
  const lastUsed = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const touch = (id: string | undefined, position: number) => {
    if (!id || !allowed.has(id)) return;
    lastUsed.set(id, position);
    if (!firstSeen.has(id)) firstSeen.set(id, position);
  };
  history.forEach((message, position) => {
    if (message.role === "user") {
      // The question's best skill, then the screen's main one, then the rest (only skills this role has).
      const [best, ...others] = questionSkillIds(message.content, available, max, mentions);
      const [main, ...more] = screenSkills(message.screen?.kind).filter((id) => allowed.has(id));
      [...new Set([best, main, ...others, ...more].filter((id) => id !== undefined))].slice(0, max).forEach((id) => touch(id, position));
    } else if (message.role === "tool" && message.toolName) {
      loadedBy(message).forEach((id) => touch(id, position));
      const tool = getAssistantTool(message.toolName);
      if (tool && !tool.core && message.toolStatus !== "failed") touch(tool.skill, position);
    }
  });
  // The current turn (the latest question and what ran since) keeps every skill; earlier turns fill the
  // remaining slots, most recently used first.
  const turnStart = history.findLastIndex((message) => message.role === "user");
  const byRecency = [...lastUsed.entries()].sort((a, b) => b[1] - a[1]);
  const current = turnStart < 0 ? [] : byRecency.filter(([, position]) => position >= turnStart).map(([id]) => id);
  const earlier = byRecency.filter(([id]) => !current.includes(id)).map(([id]) => id);
  const recent = [...current, ...earlier.slice(0, Math.max(0, max - current.length))];
  // A newer activation wins over an older one, but once active a skill keeps its place in the list.
  return recent.sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0));
}

/** The skills and tools for the next request. `permitted` is every tool this person may use. */
export function planTurn(
  history: LoopMessage[],
  role: Role,
  permitted: RegisteredAssistantTool[],
  options: { max?: number; mentions?: (text: string) => string[] } = {},
): TurnPlan {
  const skills = activeSkillIds(history, role, options.max ?? MAX_ACTIVE_SKILLS, options.mentions).flatMap((id) => getAssistantSkill(id) ?? []);
  const core = permitted.filter((tool) => tool.core);
  const active = skills.flatMap((skill) => permitted.filter((tool) => !tool.core && tool.skill === skill.id));
  return { skills, tools: [...core, ...active] };
}

// ── Several questions in one message ──────────────────────────────────────────────────────────────────

export type MissedPart = { skill: RegisteredAssistantSkill; text: string };

/**
 * The parts of the latest question that this turn left unanswered: the question has two or more parts that
 * match a real keyword (not chit-chat, not only a date), the turn called a tool of at least one part's
 * skills, and no tool of this part's skills. With `answer`, a part the answer talks about (one of its
 * skill's keywords, e.g. "het weer kan ik niet ophalen") counts as handled. Deterministic and cheap: the
 * loop asks the model once more for these (assistant-loop `followUp`).
 */
export function missedParts(history: LoopMessage[], role: Role, answer: string | null = null): MissedPart[] {
  const turnStart = history.findLastIndex((message) => message.role === "user");
  const question = history[turnStart];
  if (!question) return [];
  const available = routableSkills(role);
  const parts = routeParts(question.content, available).flatMap((part) => {
    const strong = part.matches.filter((match) => match.strong).map((match) => match.id);
    return strong.length ? [{ text: part.text, skills: strong }] : [];
  });
  if (parts.length < 2) return [];
  const used = new Set(
    history.slice(turnStart + 1).flatMap((message) => {
      const tool = message.role === "tool" && message.toolName ? getAssistantTool(message.toolName) : undefined;
      return tool ? [tool.skill] : [];
    }),
  );
  const handled = (part: { skills: string[] }) => part.skills.some((id) => used.has(id));
  if (!parts.some(handled)) return [];
  const missed: MissedPart[] = [];
  for (const part of parts) {
    if (handled(part)) continue;
    const skill = getAssistantSkill(part.skills[0] ?? "");
    if (!skill || missed.some((item) => item.skill.id === skill.id)) continue;
    if (answer && part.skills.some((id) => { const other = getAssistantSkill(id); return other ? mentionsSkill(answer, other) : false; })) continue;
    missed.push({ skill, text: part.text });
  }
  return missed;
}

/** The one-time note to the model about the parts it skipped (sent as a user message, never stored or shown). */
export function followUpNote(missed: MissedPart[], permitted: RegisteredAssistantTool[]): string {
  const parts = missed.map(({ skill, text }) => {
    const tools = permitted.filter((tool) => tool.skill === skill.id && tool.permission === "read").slice(0, 3).map((tool) => tool.wireName);
    return `${skill.title.en} ("${text}"${tools.length ? `; tools: ${tools.join(", ")}` : ""})`;
  });
  return `(Note from the app, not from the person) You haven't answered the part about ${parts.join(" and ")} yet. Handle it now with the tools, then give one combined answer to the whole question, every part in the order asked.`;
}

/** The loop's `followUp` for a person: `null` when nothing was skipped. */
export function followUpFor(role: Role, permitted: RegisteredAssistantTool[]) {
  return (history: LoopMessage[], answer: string | null): string | null => {
    const missed = missedParts(history, role, answer);
    return missed.length ? followUpNote(missed, permitted) : null;
  };
}
