import type { SessionUser } from "@/features/auth/types/auth";
import type { Locale } from "@/types/common";
import { HOUSEHOLD_TIME_ZONE, addDays, todayIn } from "@/types/dates";
import { clockTime, dateLines } from "./context";
import type { RegisteredAssistantSkill } from "./skills";
import { words } from "./text-match";

/**
 * The system prompt, built for a small local model: short rules, then what changes rarely (the skill
 * index, the household snapshot, today's date), then the guides of the active skills. Stable parts come
 * first, so the model server can reuse its prompt cache between requests. The clock time goes with the
 * question instead (assistant-loop `questionNote`).
 */

export type PromptParts = {
  /** Skills this person has: one line each, so the model knows every area exists. */
  skills: RegisteredAssistantSkill[];
  /** Skills active in this conversation: their guides are included. */
  active: RegisteredAssistantSkill[];
  /** The household snapshot lines (context.ts). */
  snapshot?: string;
  /** Ask the model not to reason at length: Qwen 3's `/no_think` (only for Qwen models, assistant.service). */
  noThink?: boolean;
  now?: Date;
};

export const RULES = [
  "Answer in the language of the person's last message (Dutch as spoken in Flanders, or English). Be brief: one or two sentences, a short list only for several items.",
  "Use tools for household data and changes. Never invent data. Call several tools in one step when they don't depend on each other.",
  "If the message asks several things, handle every part: call the tools for all of them, then answer each part, in the order asked.",
  "Refer to people, rooms, payees, accounts, tasks… by their name in tool arguments; the app resolves names. If a tool asks which one, ask the person.",
  "Changes that need a confirmation are confirmed by the person in the app: just call the tool, never ask 'are you sure?' yourself. Never say something was done unless its tool result says so; if it waits for confirmation, say that.",
  "If you need tools of an area that is not loaded, call skills_load. To find something by name anywhere, call search_everything.",
  "Money: € 1.234,56. Dates for people: dd/mm/yyyy; in tool arguments: YYYY-MM-DD. Times: 24 h.",
  "You can never disarm the alarm or unlock anything: that is only possible in the app, with the code.",
];

/**
 * Children have only a few writes (the shopping list, their own tasks…); without this line a local model
 * keeps searching for a tool it doesn't have, or offers to do it anyway (eval 2026-10-04).
 */
export const CHILD_NOTE = "As a child they can look things up and change a few things (their own tasks, the shopping list); for a change none of your tools does, say kindly that an adult has to do it, never offer to.";

export function buildSystemPrompt(user: Pick<SessionUser, "name" | "role" | "locale" | "householdName">, parts: PromptParts): string {
  const index = parts.skills.map((skill) => `- ${skill.id}: ${skill.summary}`).join("\n");
  const guides = parts.active.map((skill) => `## ${skill.id}\n${skill.guide}`).join("\n\n");
  return [
    `You are the assistant of WickedHome, the home app of the ${user.householdName} household in Belgium. You talk with ${user.name} (${user.role}; app language ${user.locale === "nl" ? "Dutch" : "English"}).${user.role === "child" ? ` ${CHILD_NOTE}` : ""}`,
    RULES.join("\n"),
    `# Areas (skills)\n${index}`,
    `# Household\n${dateLines(parts.now)}${parts.snapshot ? `\n${parts.snapshot}` : ""}`,
    guides && `# Loaded skills\n${guides}`,
    parts.noThink && "/no_think",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Words only one of the two languages uses a lot (short, frequent; "is", "we", "in" are both and left out).
const DUTCH = new Set(
  "de het een en wat wie waar wanneer hoe hoeveel welke welk moet moeten ik jij je mijn onze ons van op voor met niet nog er zijn staat staan heb hebben heeft kan kunnen gaat wordt zet voeg toe vandaag morgen deze die dat maar ook al uit naar bij om geen alle allemaal weer betaling".split(" "),
);
const ENGLISH = new Set(
  "the a an and what who where when how which are my our i you your to of on for with not still there have has can will add put today tomorrow this that it from at me do does any all weather payment".split(" "),
);

/**
 * The language of a question: Dutch or English by their most common words, `fallback` (the app language)
 * when it's a tie. Local models drift to Dutch when the household data is Dutch; saying it per question
 * keeps an English question English.
 */
export function questionLanguage(text: string, fallback: Locale): Locale {
  let nl = 0;
  let en = 0;
  for (const word of words(text)) {
    if (DUTCH.has(word)) nl += 1;
    if (ENGLISH.has(word)) en += 1;
  }
  return nl > en ? "nl" : en > nl ? "en" : fallback;
}

const WEEKDAY_WORDS =
  /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/** "zaterdag 2026-10-10, zondag 2026-10-11, …": the coming seven days in the question's language. */
export function comingWeekdays(language: Locale, now: Date = new Date()): string {
  const today = todayIn(HOUSEHOLD_TIME_ZONE, now);
  const format = new Intl.DateTimeFormat(language === "nl" ? "nl-BE" : "en-GB", { timeZone: "UTC", weekday: "long" });
  return Array.from({ length: 7 }, (_, index) => addDays(today, index + 1))
    .map((date) => `${format.format(new Date(`${date}T12:00:00Z`))} ${date}`)
    .join(", ");
}

/**
 * The note that goes with the latest question: the clock time, the language to answer in and, when the
 * question names a weekday, the dates of the coming days. Gemma 4 took "zaterdag" a day late (it counted
 * from its own idea of today's weekday) even with the same list in the system prompt; next to the question
 * it reads it (eval 2026-10-04: 0/5 → 4/5).
 */
export function questionNoteFor(locale: Locale, now?: Date) {
  return (question: string) => {
    const language = questionLanguage(question, locale);
    const days = WEEKDAY_WORDS.test(question) ? `; dates: ${comingWeekdays(language, now)}` : "";
    // Background for the model only; local models otherwise echo it ("(Het is nu 20:26)").
    return `(context, never repeat it: now ${clockTime(now ?? new Date())}; answer in ${language === "nl" ? "Dutch" : "English"}${days})`;
  };
}
