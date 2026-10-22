/**
 * The assistant's eval: ~230 questions in Dutch and English (ai/eval/scenarios.ts) against the configured
 * model, on a throwaway copy of the schema with a seeded household. Reports pre-routing accuracy, tool
 * choice, arguments, refusals, latency and prompt tokens.
 *
 *   npm run assistant:eval                      # all scenarios (needs ASSISTANT_BASE_URL + ASSISTANT_MODEL)
 *   npm run assistant:eval -- --routing         # keyword routing only: no model, no database (seconds)
 *   npm run assistant:eval -- --only=tasks,cal  # scenarios whose id starts with one of these
 *   npm run assistant:eval -- --verbose         # every call and answer
 *
 * Without a configured model it says so and runs the routing check only. Needs DATABASE_URL in .env with a
 * role that may create databases; the database `wh_assistant_eval_<pid>` is created, migrated and dropped.
 * Writes are never executed: every write asks for confirmation, and the harness stops there.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";
import type { LoopMessage } from "@ai/core/assistant-loop";
import type { PromptMeasure } from "@ai/core/tokens";
import type { ArgExpectation, Scenario } from "./scenarios";

if (existsSync(".env")) process.loadEnvFile(".env");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
const ROUTING_ONLY = Boolean(flag("routing"));
const VERBOSE = Boolean(flag("verbose"));
const ONLY = flag("only")?.split("=")[1]?.split(",").filter(Boolean) ?? [];

const BASE_URL = process.env.DATABASE_URL;
const DB = `wh_assistant_eval_${process.pid}`;
const testUrl = (() => {
  if (!BASE_URL) return "postgresql://eval@localhost/eval";
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();
// The app's modules read DATABASE_URL when they load: point them at the throwaway database first.
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV ??= "test";

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: BASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/** The scenario as a conversation: its earlier turns (user, assistant, …), then the question. */
function conversationOf(scenario: Scenario): LoopMessage[] {
  const earlier = (scenario.before ?? []).map((content, index): LoopMessage => ({ id: `b${index}`, role: index % 2 === 0 ? "user" : "assistant", content }));
  return [...earlier, { id: "q", role: "user", content: scenario.say, ...(scenario.screen && { screen: { kind: scenario.screen.kind } }) }];
}

/**
 * Does a model argument meet the expectation? Strings: contains (case/accents ignored), `a|b` = either; entity
 * refs too. `named(id)` is what an id stood for in an earlier tool result of the turn (the model may pass an id
 * it got back, e.g. from search_everything, instead of the name): its record as text, or null.
 */
function argMatches(actual: unknown, expected: ArgExpectation, fold: (value: string) => string, named: (id: string) => string | null = () => null): boolean {
  const contains = (value: string, wanted: string) => wanted.split("|").some((option) => fold(value).includes(fold(option)));
  const matches = (value: string, wanted: string) => contains(value, wanted) || contains(named(value) ?? "", wanted);
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.every((value) => actual.some((item) => typeof item === "string" && matches(item, value)));
  if (typeof expected === "string") return typeof actual === "string" && matches(actual, expected);
  return actual === expected;
}

/** Every object with an `id` in the turn's tool results, as text by id (for ids the model passes back). */
function recordsById(history: LoopMessage[]): Map<string, string> {
  const records = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.id === "string") records.set(record.id, JSON.stringify(record));
      Object.values(record).forEach(visit);
    }
  };
  for (const message of history) if (message.role === "tool" && message.toolResult?.ok) visit(message.toolResult.data);
  return records;
}

/** Scenario arguments: a key `a|b` is met by either argument (e.g. contacts_find `contact|query`). */
function argsMet(args: Record<string, unknown>, expected: Record<string, ArgExpectation>, fold: (value: string) => string, named: (id: string) => string | null): boolean {
  return Object.entries(expected).every(([keys, wanted]) => keys.split("|").some((key) => argMatches(args[key], wanted, fold, named)));
}

type Outcome = {
  scenario: Scenario;
  routed: string[];
  loaded: string[];
  calls: { name: string; args: Record<string, unknown>; status: string }[];
  answer: string;
  ms: number;
  /** The loop asked the model once more for a skipped part. */
  followUps: number;
  measures: PromptMeasure[];
  toolOk: boolean | null;
  argsOk: boolean | null;
  refuseOk: boolean | null;
  error: string | null;
};

const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "—");

async function main() {
  const { scenarios } = await import("./scenarios");
  const { todayIn } = await import("@/types/dates");
  await import("@ai/skills");
  // The scheduled jobs register where their routes load; the eval loads no routes, so automations_* need them here.
  await Promise.all([
    import("@/api/waste/waste.jobs"),
    import("@/api/mail/mail.jobs"),
    import("@/api/expenses/expenses.jobs"),
    import("@/api/documents/documents.jobs"),
    import("@/api/shops/shops.jobs"),
    import("@/api/shopping/shopping.jobs"),
    import("@/api/income/income.jobs"),
    import("@/api/notifications/notifications.jobs"),
    import("@/api/auth/auth.jobs"),
    import("@/api/integrations/integrations.jobs"),
    import("@/api/audit/audit.jobs"),
    import("@/api/jobs/run-history.jobs"),
    import("@ai/core/assistant.jobs"),
  ]);
  // Web search never goes to the internet in the eval: a fake SearXNG and fake shop pages (src/api/web/web-fake.ts).
  const { installFakeWeb } = await import("@/api/web/web-fake");
  installFakeWeb();
  await import("@ai/core/core-tools");
  const { routeMessage, skillsForRole } = await import("@ai/core/skills");
  const { fold } = await import("@ai/core/text-match");

  const all = scenarios(todayIn()).filter((scenario) => !ONLY.length || ONLY.some((prefix) => scenario.id.startsWith(prefix)));

  // 1. Pre-routing (keywords only): no model needed.
  const { activeSkillIds } = await import("@ai/core/routing");
  let routedRight = 0;
  let routable = 0;
  let multiRight = 0;
  let multiTotal = 0;
  for (const scenario of all) {
    if (!scenario.skills.length) continue;
    routable += 1;
    const role = scenario.as === "child" ? "child" : "owner";
    const available = skillsForRole(role);
    const routed = routeMessage(scenario.say, available).map((match) => match.id);
    // Several parts: every part's skill must be active for the turn (what the model actually gets).
    const active = activeSkillIds(conversationOf(scenario), role);
    // Multi-turn: a skill of an earlier turn stays active, so the turn as a whole counts; a screen adds its skills.
    const ok = scenario.tools
      ? scenario.skills.every((skill) => active.includes(skill))
      : scenario.skills.some((skill) => (scenario.before || scenario.screen ? active : routed).includes(skill));
    if (scenario.tools) multiTotal += 1;
    if (ok) {
      routedRight += 1;
      if (scenario.tools) multiRight += 1;
    } else if (VERBOSE || ROUTING_ONLY) {
      console.log(`  routing miss  ${scenario.id}: "${scenario.say}" → [${(scenario.tools ? active : routed).join(", ")}], expected ${scenario.skills.join(scenario.tools ? " and " : " or ")}`);
    }
  }
  console.log(`Pre-routing: ${routedRight}/${routable} (${pct(routedRight, routable)}) of ${all.length} scenarios route to an expected skill without a model call.`);
  if (multiTotal) console.log(`Several parts: ${multiRight}/${multiTotal} messages activate every part's skill.`);
  if (ROUTING_ONLY && routedRight < routable) process.exitCode = 1;

  // Prompt size of a typical request, all tools vs. core + active skills (no snapshot: that needs data).
  {
    const { toolsFor, toOpenAiTools } = await import("@ai/core/tools");
    const { planTurn } = await import("@ai/core/routing");
    const { buildSystemPrompt } = await import("@ai/core/assistant-prompt");
    const { skillIndexFor } = await import("@ai/core/assistant.service");
    const { estimateJsonTokens, estimateTokens } = await import("@ai/core/tokens");
    const permitted = toolsFor("owner");
    const question = "Wat moet ik vandaag nog doen?";
    const turn = planTurn([{ id: "q", role: "user", content: question }], "owner", permitted);
    const user = { name: "Rob", role: "owner" as const, locale: "nl" as const, householdName: "Eval" };
    const system = buildSystemPrompt(user, { skills: skillIndexFor(permitted, "owner"), active: turn.skills });
    const allTools = estimateJsonTokens(toOpenAiTools(permitted));
    const sent = estimateJsonTokens(toOpenAiTools(turn.tools));
    console.log(
      `Prompt for "${question}": system ~${estimateTokens(system)} tokens (+ snapshot), tools ~${sent} tokens (${turn.tools.length} of ${permitted.length}; all would be ~${allTools}), skills [${turn.skills.map((skill) => skill.id).join(", ")}].`,
    );
  }

  const { readAssistantSettings } = await import("@ai/core/assistant-config");
  const settings = readAssistantSettings();
  if (ROUTING_ONLY) return;
  if (settings.problem) {
    console.log(`\nThe model part is skipped: the assistant is not configured (${settings.problem}). Set ASSISTANT_BASE_URL and ASSISTANT_MODEL in .env (ai/docs/ASSISTANT.md) and run again.`);
    return;
  }
  if (!BASE_URL) throw new Error("DATABASE_URL missing in .env");

  // 2. A throwaway database with the seeded household.
  await admin(`CREATE DATABASE ${DB}`);
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "pipe" });
    const { seedEvalHousehold } = await import("./seed");
    const household = await seedEvalHousehold();
    const { runAssistantLoop } = await import("@ai/core/assistant-loop");
    const { planFor } = await import("@ai/core/assistant.service");
    const { createOpenAiChatModel } = await import("@ai/core/llm-client");
    const { toolsFor, getAssistantTool } = await import("@ai/core/tools");
    const { followUpFor } = await import("@ai/core/routing");
    const { questionNoteFor } = await import("@ai/core/assistant-prompt");
    const { resolveScreen, withScreenNote } = await import("@ai/core/screen-context");
    const { ENTITY_TYPES, resolveEntity } = await import("@ai/core/resolve");
    const model = createOpenAiChatModel(settings);
    console.log(`Model ${settings.model} at ${settings.baseUrl}; ${all.length} scenarios.\n`);

    const outcomes: Outcome[] = [];
    for (const scenario of all) {
      const user = { ...(scenario.as === "child" ? household.child : household.owner), locale: scenario.lang };
      const permitted = toolsFor(user.role);
      const base = { user, householdId: user.householdId, locale: scenario.lang, signal: AbortSignal.timeout(300_000), channel: "chat" as const };
      // Asked from a page: the seeded record by name, then looked up as the service does (household-scoped).
      let screenId: string | undefined;
      const asked = scenario.screen;
      // The cooking screen shows a meal (looked up by its recipe's name).
      const lookup = asked?.kind === "cooking" ? "meal" : asked?.kind;
      if (asked?.name && lookup && (ENTITY_TYPES as readonly string[]).includes(lookup)) {
        const found = await resolveEntity(base, lookup as (typeof ENTITY_TYPES)[number], asked.name);
        if (found.ok) screenId = found.entity.id;
      }
      const screen = asked ? await resolveScreen(base, { kind: asked.kind, ...(screenId && { id: screenId }) }) : null;
      const ctx = screen ? { ...base, screen: { kind: screen.kind, ...(screen.id && { id: screen.id }) } } : base;
      let sequence = 0;
      const history: LoopMessage[] = conversationOf(scenario);
      const measures: PromptMeasure[] = [];
      let answer = "";
      let error: string | null = null;
      let followUps = 0;
      const followUp = followUpFor(user.role, permitted);
      const started = Date.now();
      await runAssistantLoop(history, {
        model,
        tools: permitted,
        ctx,
        systemPrompt: "",
        plan: await planFor(user, ctx, permitted, { settings }),
        questionNote: withScreenNote(questionNoteFor(user.locale), screen),
        onMeasure: (measure) => measures.push(measure),
        rememberedSkips: new Set(),
        followUp: (current, text) => {
          const note = followUp(current, text);
          if (note && text !== null) followUps += 1;
          return note;
        },
        log: { conversationId: `eval:${scenario.id}`, model: settings.model },
        save: async (message) => ({ id: `m${(sequence += 1)}`, ...message }),
        update: async () => {},
        remember: async () => {},
        emit: (event) => {
          if (event.type === "text") answer += event.text;
          if (event.type === "error") error = event.message;
        },
      });
      const ms = Date.now() - started;
      const calls = history
        .filter((message) => message.role === "tool")
        .map((message) => ({ name: message.toolName ?? "?", args: (message.toolArgs ?? {}) as Record<string, unknown>, status: message.toolStatus ?? "?" }));
      const loaded = [...new Set(measures.flatMap((measure) => measure.skills))];
      const routed = routeMessage(scenario.say, skillsForRole(user.role)).map((match) => match.id);

      let toolOk: boolean | null = null;
      let argsOk: boolean | null = null;
      let refuseOk: boolean | null = null;
      if (scenario.tool) {
        // `a|b`: either tool is right. The arguments of its last call count: a first call the app answered with
        // "which one?" or "not found" that the model then corrected changes nothing.
        const wanted = scenario.tool.split("|");
        const call = calls.findLast((candidate) => wanted.includes(candidate.name));
        toolOk = Boolean(call);
        const records = recordsById(history);
        if (scenario.args) argsOk = Boolean(call) && argsMet(call?.args ?? {}, scenario.args, fold, (id) => records.get(id) ?? null);
      }
      if (scenario.tools) toolOk = scenario.tools.every((name) => calls.some((candidate) => candidate.name === name));
      if (scenario.refuse) {
        // A write the app refused (the role, a child's argument rule) changed nothing and showed no card: only a
        // write that ran or waits for a confirmation counts.
        const wrote = calls.some((call) => (getAssistantTool(call.name)?.permission ?? "read") !== "read" && (call.status === "pending" || call.status === "done"));
        refuseOk = !wrote && answer.trim().length > 0;
      }
      const outcome: Outcome = { scenario, routed, loaded, calls, answer, ms, followUps, measures, toolOk, argsOk, refuseOk, error };
      outcomes.push(outcome);

      const marks = [
        toolOk === null ? "" : toolOk ? "tool ✓" : "tool ✗",
        argsOk === null ? "" : argsOk ? "args ✓" : "args ✗",
        refuseOk === null ? "" : refuseOk ? "refused ✓" : "refused ✗",
        followUps ? "follow-up" : "",
      ].filter(Boolean);
      const first = measures[0];
      console.log(
        `${scenario.id.padEnd(24)} ${String(ms).padStart(6)} ms  ${String(first?.promptTokens ?? first?.totalTokens ?? 0).padStart(5)} tok  ${marks.join(" ").padEnd(20)} ${calls.map((call) => call.name).join(", ") || "(no tool)"}${error ? `  ERROR ${error}` : ""}`,
      );
      if (VERBOSE) {
        for (const call of calls) console.log(`    ${call.name} ${JSON.stringify(call.args)} → ${call.status}`);
        console.log(`    answer: ${answer.trim().slice(0, 300)}`);
      }
    }

    // 3. Summary.
    const withTool = outcomes.filter((outcome) => outcome.toolOk !== null);
    const withArgs = outcomes.filter((outcome) => outcome.argsOk !== null);
    const refusals = outcomes.filter((outcome) => outcome.refuseOk !== null);
    const avg = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);
    const firstPrompt = outcomes.map((outcome) => outcome.measures[0]?.promptTokens ?? outcome.measures[0]?.totalTokens ?? 0);
    const steps = outcomes.map((outcome) => outcome.measures.length);
    console.log("\nSummary");
    console.log(`  tool choice      ${withTool.filter((outcome) => outcome.toolOk).length}/${withTool.length} (${pct(withTool.filter((outcome) => outcome.toolOk).length, withTool.length)})`);
    console.log(`  arguments        ${withArgs.filter((outcome) => outcome.argsOk).length}/${withArgs.length} (${pct(withArgs.filter((outcome) => outcome.argsOk).length, withArgs.length)})`);
    console.log(`  refusals         ${refusals.filter((outcome) => outcome.refuseOk).length}/${refusals.length}`);
    console.log(`  pre-routing      ${routedRight}/${routable} (${pct(routedRight, routable)})`);
    console.log(`  latency          avg ${avg(outcomes.map((outcome) => outcome.ms))} ms per question, ${(avg(steps.map((count) => count * 100)) / 100).toFixed(2)} model calls`);
    console.log(`  prompt tokens    avg ${avg(firstPrompt)} on the first call (${outcomes[0]?.measures[0]?.promptTokens !== null ? "server count" : "estimate"})`);
    console.log(`  errors           ${outcomes.filter((outcome) => outcome.error).length}`);
    const multi = outcomes.filter((outcome) => outcome.scenario.tools);
    if (multi.length) console.log(`  several parts    ${multi.filter((outcome) => outcome.toolOk).length}/${multi.length} with every part's tool called`);
    const followed = outcomes.filter((outcome) => outcome.followUps);
    console.log(`  follow-ups       ${followed.length} (${followed.map((outcome) => outcome.scenario.id).join(", ") || "none"})`);

    // Per area (the scenario id's prefix): tool choice, arguments, refusals, latency, prompt tokens.
    const groups = new Map<string, Outcome[]>();
    for (const outcome of outcomes) {
      const key = outcome.scenario.id.split("-")[0] ?? outcome.scenario.id;
      groups.set(key, [...(groups.get(key) ?? []), outcome]);
    }
    const ratio = (list: Outcome[], pick: (outcome: Outcome) => boolean | null) => {
      const judged = list.filter((outcome) => pick(outcome) !== null);
      return judged.length ? `${judged.filter((outcome) => pick(outcome)).length}/${judged.length}` : "—";
    };
    console.log(`\n  ${"area".padEnd(8)} ${"n".padStart(3)}  ${"tool".padStart(7)}  ${"args".padStart(7)}  ${"refuse".padStart(6)}  ${"avg ms".padStart(7)}  ${"tok".padStart(5)}`);
    for (const [key, list] of groups) {
      const tokens = avg(list.map((outcome) => outcome.measures[0]?.promptTokens ?? outcome.measures[0]?.totalTokens ?? 0));
      console.log(
        `  ${key.padEnd(8)} ${String(list.length).padStart(3)}  ${ratio(list, (o) => o.toolOk).padStart(7)}  ${ratio(list, (o) => o.argsOk).padStart(7)}  ${ratio(list, (o) => o.refuseOk).padStart(6)}  ${String(avg(list.map((o) => o.ms))).padStart(7)}  ${String(tokens).padStart(5)}`,
      );
    }
    const failed = outcomes.filter((outcome) => outcome.toolOk === false || outcome.argsOk === false || outcome.refuseOk === false);
    if (failed.length) {
      console.log("\n  Misses");
      for (const outcome of failed) {
        console.log(`  ${outcome.scenario.id.padEnd(26)} expected ${outcome.scenario.tools?.join(" + ") ?? outcome.scenario.tool ?? "refusal"}; got ${outcome.calls.map((call) => `${call.name} ${JSON.stringify(call.args)}`).join(", ").slice(0, 220) || "(no tool)"}`);
      }
    }
  } finally {
    const { db } = await import("@/api/lib/db");
    await db.$disconnect().catch(() => {});
    await admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    console.log(`\ndropped ${DB}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
