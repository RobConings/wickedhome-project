import { z } from "zod";
import { badRequest } from "@/api/lib/http";
import { appPages, findInApp } from "./app-map";
import { capList, lines } from "./compact";
import { clockTime, dateLines, householdSnapshot } from "./context";
import { ENTITY_TYPES } from "./resolve";
import { LOAD_SKILLS_TOOL } from "./routing";
import { searchEverything } from "./search";
import { getAssistantSkill, registerAssistantSkill, routeMessage, skillsForRole } from "./skills";
import { activityOf, registerAssistantTool, toolsFor } from "./tools";

/**
 * The always-on core tools (sent with every request, ~350 tokens together):
 *
 * - `skills_load`: activates skills, so their tools and guides are in the next step (routing.ts reads the call).
 * - `search_everything`: one search over every entity resolver and search source.
 * - `app_context`: a fresh household snapshot (the prompt's copy may be a few minutes old) and the time.
 * - `app_help`: what the assistant can do, from the registered skills; with `topic`, where it is in the app and how it
 *   works (page map and notes read from the code on demand, app-map.ts).
 *
 * Imported once by the assistant service.
 */

registerAssistantSkill({
  id: "app",
  title: { en: "The app and the assistant", nl: "De app en de assistent" },
  summary: "What the assistant can do, searching everything, the household snapshot.",
  // Its tools are core (always sent), so routing never needs to activate it.
  keywords: { nl: [], en: [] },
  guide: [
    "- The Areas list shows every skill; skills_load activates one so its tools appear.",
    "- search_everything finds things by name across all areas; use the returned id or name in the next call.",
    "- app_help answers 'what can you do' from the registered skills: summarise it in two or three sentences.",
    "- 'Waar vind ik X' / 'how does X work' → app_help topic X: name the page and its path, and explain in a sentence or two.",
  ].join("\n"),
});

registerAssistantTool({
  name: LOAD_SKILLS_TOOL,
  description: "Load one or more skills (areas of the app) so their tools and guide are available in your next step. Use when the request needs an area that is not loaded yet.",
  input: z.object({ skills: z.array(z.string().min(1).max(40)).min(1).max(3).describe("Skill ids from the Areas list, e.g. ['projects']") }),
  permission: "read",
  confirm: "never",
  core: true,
  skill: "app",
  activity: { en: "Looked up how to do it", nl: "Opgezocht hoe het moet" },
  run: (ctx, input) => {
    const available = new Map(skillsForRole(ctx.user.role).map((skill) => [skill.id, skill]));
    const unknown = input.skills.filter((id) => !available.has(id));
    if (unknown.length) throw badRequest(`Unknown skill(s): ${unknown.join(", ")}. Available: ${[...available.keys()].join(", ")}`);
    const tools = toolsFor(ctx.user.role).filter((tool) => input.skills.includes(tool.skill) && !tool.core);
    return { loaded: input.skills, tools: tools.map((tool) => tool.wireName), note: "The tools and guide are available now." };
  },
});

registerAssistantTool({
  name: "search.everything",
  description:
    "Find anything in the household by name or words: people, rooms, tasks, events, payees, accounts, projects, products, devices, documents… Returns type, id, title and the skill to load for more.",
  input: z.object({
    query: z.string().trim().min(1).max(120),
    types: z.array(z.enum(ENTITY_TYPES)).max(5).optional().describe("Only these kinds, e.g. ['task','event']"),
  }),
  permission: "read",
  confirm: "never",
  core: true,
  skill: "app",
  activity: { en: "Searched the app", nl: "In de app gezocht" },
  run: async (ctx, input) => {
    const { hits, more } = await searchEverything(ctx, input.query, { types: input.types, limit: 10 });
    return hits.length ? { hits, ...(more && { more }) } : { hits: [], note: `Nothing found for "${input.query}".` };
  },
});

registerAssistantTool({
  name: "app.context",
  description: "A fresh snapshot of the household (people, rooms, accounts…), today's date and the current time. Use when the snapshot in the prompt may be outdated.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  core: true,
  skill: "app",
  activity: { en: "Checked the household", nl: "Huishouden bekeken" },
  run: async (ctx) => lines(dateLines(), `Time: ${clockTime()}`, await householdSnapshot(ctx, { fresh: true })),
});

registerAssistantTool({
  name: "app.help",
  description:
    "What the assistant can do (every area, or one skill's tools), and with `topic` where something is in the app (page and path) and how it works. Use for 'what can you do' / 'wat kan je', 'waar vind ik…' / 'where is…', 'hoe werkt…' / 'how does … work'.",
  input: z.object({
    skill: z.string().max(40).optional().describe("One skill id for details"),
    topic: z.string().trim().max(80).optional().describe("A thing or page, e.g. 'meldingen', 'mail bills', 'automations'"),
  }),
  permission: "read",
  confirm: "never",
  core: true,
  skill: "app",
  activity: { en: "Listed what I can do", nl: "Opgesomd wat ik kan" },
  run: (ctx, input) => {
    const permitted = toolsFor(ctx.user.role).filter((tool) => !tool.core);
    if (input.topic) {
      // Lazy: the page map and notes are read from the code (app-map.ts) only when asked.
      const { pages, notes } = findInApp(input.topic, ctx.locale);
      const skills = routeMessage(input.topic, skillsForRole(ctx.user.role).filter((skill) => permitted.some((tool) => tool.skill === skill.id))).map((match) => match.id);
      if (!pages.length && !notes.length) return { topic: input.topic, note: "No page or note matches; these are all pages.", pages: appPages(ctx.locale).map((page) => `${page.name}: ${page.path}`) };
      return {
        pages: pages.map((page) => `${page.name}: ${page.path}`),
        how: notes.map((note) => `${note.title}\n${note.text}`).join("\n\n") || null,
        assistantSkills: skills.length ? skills : null,
      };
    }
    if (input.skill) {
      const skill = getAssistantSkill(input.skill);
      if (!skill || !skill.roles.includes(ctx.user.role)) return { error: `Unknown skill "${input.skill}"` };
      return {
        skill: skill.title[ctx.locale],
        about: skill.summary,
        tools: permitted
          .filter((tool) => tool.skill === skill.id)
          .map((tool) => ({ does: activityOf(tool, ctx.locale), asks: tool.confirm === "never" ? "no" : tool.confirm === "always" ? "always" : "first time" })),
      };
    }
    const skills = skillsForRole(ctx.user.role).filter((skill) => permitted.some((tool) => tool.skill === skill.id));
    return {
      ...capList(skills, 40, (skill) => ({ area: skill.title[ctx.locale], covers: skill.summary })),
      note: "Reading never asks. Changes ask for a confirmation in the app (money, deletes and the alarm always). Disarming the alarm is impossible. For where something is or how it works, call again with topic.",
    };
  },
});
