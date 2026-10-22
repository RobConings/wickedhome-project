/**
 * Skills, intent routing, dynamic tool loading and token budgeting, with test skills and a fake model.
 * No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/routing.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { z } from "zod";
import type { SessionUser } from "@/features/auth/types/auth";
import { runAssistantLoop, toChatMessages, type LoopDeps, type LoopMessage } from "./assistant-loop";
import { buildSystemPrompt, questionLanguage, questionNoteFor } from "./assistant-prompt";
import "./core-tools";
import type { ChatModel, ChatRequest } from "./llm-client";
import { activeSkillIds, followUpFor, missedParts, planTurn, questionSkillIds } from "./routing";
import { registerAssistantSkill, routeIntents, routeMessage, routeParts, skillsForRole, unregisterAssistantSkill } from "./skills";
import { estimateTokens, type PromptMeasure } from "./tokens";
import { registerAssistantTool, toolsFor, unregisterAssistantTool, type AssistantToolContext } from "./tools";

const user: SessionUser = { id: "u1", email: "rob@example.com", name: "Rob", role: "adult", locale: "nl", householdId: "h-routing", householdName: "Test", habitantId: "rob" };
const ctx: AssistantToolContext = { user, householdId: user.householdId, locale: "nl", signal: new AbortController().signal, channel: "chat" };

const skillIds = ["rtchores", "rtgarden", "rtmoney", "rtpets", "rtweather", "rtagenda"];
registerAssistantSkill({ id: "rtchores", title: { en: "Chores", nl: "Klusjes" }, summary: "Chores.", keywords: { nl: ["klusje", "afwas"], en: ["chore", "dishes"] }, guide: "Chores guide." });
registerAssistantSkill({ id: "rtgarden", title: { en: "Garden", nl: "Tuin" }, summary: "Garden.", keywords: { nl: ["moestuin", "gras maaien"], en: ["vegetable garden", "mow"] }, guide: "Garden guide." });
registerAssistantSkill({ id: "rtmoney", title: { en: "Money", nl: "Geld" }, summary: "Money.", keywords: { nl: ["spaarpot"], en: ["piggy bank"] }, guide: "Money guide." });
registerAssistantSkill({ id: "rtpets", title: { en: "Pets", nl: "Huisdieren" }, summary: "Pets.", keywords: { nl: ["hond", "kat", "voer en water"], en: ["dog", "cat"] }, guide: "Pets guide." });
registerAssistantSkill({ id: "rtweather", title: { en: "Weather", nl: "Weer" }, summary: "Weather.", keywords: { nl: ["weer", "het weer", "regen", "regenen"], en: ["weather", "rain"] }, guide: "Weather guide." });
registerAssistantSkill({
  id: "rtagenda",
  title: { en: "Agenda", nl: "Agenda" },
  summary: "Agenda.",
  keywords: { nl: ["agenda", "afspraak"], en: ["agenda", "appointment"] },
  hints: { nl: ["morgen", "wanneer"], en: ["tomorrow", "when"] },
  guide: "Agenda guide.",
});

const read = (name: string, skill: string) =>
  registerAssistantTool({ name, description: `Read ${skill}.`, input: z.object({}), permission: "read", confirm: "never", skill, activity: { en: "Read", nl: "Gelezen" }, run: () => ({ ok: name }) });
const tools = [
  read("rtchores.list", "rtchores"),
  read("rtgarden.list", "rtgarden"),
  read("rtmoney.list", "rtmoney"),
  read("rtpets.list", "rtpets"),
  read("rtweather.forecast", "rtweather"),
  read("rtagenda.list", "rtagenda"),
];
after(() => {
  tools.forEach((tool) => unregisterAssistantTool(tool.name));
  skillIds.forEach((id) => unregisterAssistantSkill(id));
});

let sequence = 0;
const msg = (message: Omit<LoopMessage, "id">): LoopMessage => ({ id: `m${(sequence += 1)}`, ...message });
const question = (content: string) => msg({ role: "user", content });
const ranTool = (toolName: string, toolArgs: unknown = {}) => msg({ role: "tool", content: "", toolCallId: `c${sequence}`, toolName, toolArgs, toolStatus: "done", toolResult: { ok: true, data: null } });

describe("routeMessage", () => {
  it("matches keywords case- and accent-insensitively, with plurals and phrases", () => {
    assert.deepEqual(routeMessage("Wie doet de AFWAS?").map((match) => match.id), ["rtchores"]);
    assert.deepEqual(routeMessage("De klusjes van vandaag").map((match) => match.id), ["rtchores"]);
    assert.deepEqual(routeMessage("Moet het gras maaien deze week?").map((match) => match.id), ["rtgarden"]);
    assert.deepEqual(routeMessage("Hello there"), []);
  });

  it("returns at most two skills, the second only when it is a close second", () => {
    const matches = routeMessage("De hond en de kat en de afwas").map((match) => match.id);
    assert.ok(matches.length <= 2);
    assert.equal(matches[0], "rtpets");
  });
});

describe("several questions in one message", () => {
  const available = () => skillsForRole("adult").filter((skill) => skillIds.includes(skill.id));

  it("splits a message into parts and routes each part", () => {
    const parts = routeParts("Wie doet de afwas, en hoe gaat het met de hond? Regent het morgen", available());
    assert.deepEqual(
      parts.map((part) => part.matches[0]?.id),
      ["rtchores", "rtpets", "rtweather"],
    );
    // A keyword with "en" in it stays one part.
    assert.deepEqual(routeParts("Is er nog voer en water voor de dieren?", available()).map((part) => part.text), ["Is er nog voer en water voor de dieren"]);
    // A decimal comma is not a boundary; a part without a keyword is left out.
    assert.deepEqual(routeParts("12,50 in de spaarpot? Bedankt", available()).map((part) => part.text), ["12,50 in de spaarpot"]);
    // A comma starts a new question only before a question word; otherwise it continues the request.
    assert.deepEqual(routeParts("De hond is ziek, zet het in de agenda", available()).length, 1);
    assert.deepEqual(routeParts("Wie doet de afwas, wanneer gaat de hond naar buiten", available()).map((part) => part.text), ["Wie doet de afwas", "wanneer gaat de hond naar buiten"]);
  });

  it("finds a weak second question that whole-message routing drops (the owner's example)", () => {
    const text = "Moet het gras maaien in de moestuin en welk weer wordt het";
    assert.deepEqual(routeMessage(text, available()).map((match) => match.id), ["rtgarden"], "the weather part scores less than half");
    assert.deepEqual(routeIntents(text, available()), ["rtgarden", "rtweather"]);
    assert.deepEqual(questionSkillIds(text, available()), ["rtgarden", "rtweather"]);
  });

  it("counts hints at half weight and never as a question of their own", () => {
    // "morgen" alone routes to the agenda (nothing stronger)…
    assert.deepEqual(routeMessage("Wat is er morgen?", available()).map((match) => match.id), ["rtagenda"]);
    assert.equal(routeMessage("Wat is er morgen?", available())[0]?.strong, false);
    // …but next to a real keyword the part belongs to that skill.
    assert.deepEqual(routeIntents("Regent het morgen? En wanneer moet de hond naar de dierenarts?", available()), ["rtweather", "rtpets"]);
  });

  it("keeps every skill the current question asked for; earlier turns' skills drop first", () => {
    const history = [question("de moestuin"), question("de afwas"), question("Hoe gaat het met de hond, wat zit er in de spaarpot en regent het?")];
    assert.deepEqual(activeSkillIds(history, "adult", 3).sort(), ["rtmoney", "rtpets", "rtweather"]);
    // A skill this turn loads stays too, even past the cap.
    history.push(ranTool("skills.load", { skills: ["rtgarden"] }));
    assert.deepEqual(activeSkillIds(history, "adult", 3).sort(), ["rtgarden", "rtmoney", "rtpets", "rtweather"]);
    // The next question starts a new turn: the cap applies again, the newest question first.
    history.push(question("en de afwas?"));
    const next = activeSkillIds(history, "adult", 3);
    assert.equal(next.length, 3);
    assert.ok(next.includes("rtchores"));
  });

  it("knows which parts a turn skipped", () => {
    const history = [question("Wat zit er in de spaarpot en wat is het weer morgen?")];
    assert.deepEqual(missedParts(history, "adult"), [], "nothing ran yet: no follow-up");
    history.push(ranTool("rtmoney.list"));
    assert.deepEqual(missedParts(history, "adult").map((part) => [part.skill.id, part.text]), [["rtweather", "wat is het weer morgen"]]);
    // An answer that talks about the weather (e.g. why it can't) handled that part.
    assert.deepEqual(missedParts(history, "adult", "€ 12 in de spaarpot; het weer kan ik nu niet ophalen."), []);
    assert.equal(missedParts(history, "adult", "Er zit € 12 in de spaarpot.").length, 1);
    history.push(ranTool("rtweather.forecast"));
    assert.deepEqual(missedParts(history, "adult"), []);
    const note = followUpFor("adult", toolsFor("adult"))([question("Wat zit er in de spaarpot en regent het?"), ranTool("rtmoney.list")], "Er zit € 12 in.");
    assert.match(note ?? "", /part about Weather \("regent het"; tools: rtweather_forecast\)/);
  });

  it("never follows up on one question, chit-chat or a part that is only a date", () => {
    assert.deepEqual(missedParts([question("Wat zit er in de spaarpot?"), ranTool("search.everything")], "adult"), []);
    assert.deepEqual(missedParts([question("Dank je, en tot morgen!"), ranTool("rtmoney.list")], "adult"), []);
    assert.deepEqual(missedParts([question("Ik ben morgen thuis, wat zit er in de spaarpot?"), ranTool("rtmoney.list")], "adult"), []);
  });
});

describe("active skills", () => {
  it("activates routed skills, skills of tools that ran, and skills_load; drops the least recently used beyond the cap", () => {
    const history = [question("de afwas"), question("de moestuin"), ranTool("skills.load", { skills: ["rtmoney"] }), question("de hond")];
    assert.deepEqual(activeSkillIds(history, "adult", 3), ["rtgarden", "rtmoney", "rtpets"]);
    // Using chores again brings it back and drops the least recently used (garden).
    history.push(ranTool("rtchores.list"));
    assert.deepEqual(activeSkillIds(history, "adult", 3).sort(), ["rtchores", "rtmoney", "rtpets"]);
  });

  it("falls back to names mentioned in the question when no keyword matched", () => {
    const mentions = (text: string) => (/fluvius/i.test(text) ? ["rtmoney"] : []);
    assert.deepEqual(activeSkillIds([question("En Fluvius?")], "adult", 3, mentions), ["rtmoney"]);
    // A keyword match wins: the mention is not added on top.
    assert.deepEqual(activeSkillIds([question("De hond en Fluvius")], "adult", 3, mentions), ["rtpets"]);
  });

  it("keeps the order of activation, so the tool list stays stable", () => {
    const history = [question("de hond"), question("de afwas"), question("de hond nog eens")];
    assert.deepEqual(activeSkillIds(history, "adult"), ["rtpets", "rtchores"]);
  });

  it("sends the core tools always and only the active skills' tools", () => {
    const plan = planTurn([question("de afwas")], "adult", toolsFor("adult"));
    const names = plan.tools.map((tool) => tool.name);
    for (const core of ["skills.load", "search.everything", "app.context", "app.help"]) assert.ok(names.includes(core), core);
    assert.ok(names.includes("rtchores.list"));
    assert.ok(!names.includes("rtgarden.list"));
    assert.deepEqual(plan.skills.map((skill) => skill.id), ["rtchores"]);
  });
});

describe("the loop with dynamic tools", () => {
  it("loads a skill with skills_load and offers its tools in the next step of the same turn", async () => {
    const requests: ChatRequest[] = [];
    const steps = [
      { content: "", toolCalls: [{ id: "c1", type: "function" as const, function: { name: "skills_load", arguments: JSON.stringify({ skills: ["rtmoney"] }) } }] },
      { content: "", toolCalls: [{ id: "c2", type: "function" as const, function: { name: "rtmoney_list", arguments: "{}" } }] },
      { content: "Er zit € 12,50 in de spaarpot.", toolCalls: [] },
    ];
    const model: ChatModel = async (request) => {
      requests.push(request);
      const step = steps.shift();
      if (!step) throw new Error("out of steps");
      return { ...step, finishReason: "stop" };
    };
    const history: LoopMessage[] = [question("Hoeveel zit er nog in het potje?")];
    const permitted = toolsFor("adult");
    const measures: PromptMeasure[] = [];
    const deps: LoopDeps = {
      model,
      tools: permitted,
      ctx,
      systemPrompt: "",
      plan: (current) => {
        const turn = planTurn(current, "adult", permitted);
        return { systemPrompt: buildSystemPrompt(user, { skills: [], active: turn.skills }), tools: turn.tools, skills: turn.skills.map((skill) => skill.id) };
      },
      onMeasure: (measure) => measures.push(measure),
      rememberedSkips: new Set(),
      save: async (message) => msg(message),
      update: async () => {},
      remember: async () => {},
      emit: () => {},
    };
    assert.equal(await runAssistantLoop(history, deps), "done");
    const offered = requests.map((request) => (request.tools ?? []).map((tool) => tool.function.name));
    assert.ok(!offered[0]?.includes("rtmoney_list"), "not offered before loading");
    assert.ok(offered[1]?.includes("rtmoney_list"), "offered after skills_load");
    const system = requests[1]?.messages[0];
    assert.match(system?.role === "system" ? system.content : "", /## rtmoney\nMoney guide\./);
    assert.equal(measures.length, 3);
    assert.deepEqual(measures[1]?.skills, ["rtmoney"]);
    assert.ok(measures.every((measure) => measure.totalTokens === measure.systemTokens + measure.toolsTokens + measure.historyTokens));
  });
});

describe("the loop follows up on a skipped part", () => {
  const call = (id: string, name: string) => ({ id, type: "function" as const, function: { name, arguments: "{}" } });

  function setup(steps: { content?: string; toolCalls?: ReturnType<typeof call>[] }[]) {
    const requests: ChatRequest[] = [];
    const model: ChatModel = async (request) => {
      requests.push(request);
      const step = steps.shift();
      if (!step) throw new Error("out of steps");
      const content = step.content ?? "";
      // Stream in pieces, like a real model.
      for (const piece of content.match(/.{1,4}/gs) ?? []) request.onText?.(piece);
      return { content, toolCalls: step.toolCalls ?? [], finishReason: "stop" };
    };
    const permitted = toolsFor("adult");
    const saved: LoopMessage[] = [];
    const events: { type: string; text?: string }[] = [];
    const deps: LoopDeps = {
      model,
      tools: permitted,
      ctx,
      systemPrompt: "",
      plan: (current) => {
        const turn = planTurn(current, "adult", permitted);
        return { systemPrompt: "system", tools: turn.tools, skills: turn.skills.map((skill) => skill.id) };
      },
      followUp: followUpFor("adult", permitted),
      rememberedSkips: new Set(),
      save: async (message) => {
        const stored = msg(message);
        saved.push(stored);
        return stored;
      },
      update: async () => {},
      remember: async () => {},
      emit: (event) => events.push(event),
    };
    const shown = () => events.flatMap((event) => (event.type === "text" ? [event.text ?? ""] : [])).join("");
    return { requests, deps, saved, events, shown };
  }

  it("asks once more, and only the combined answer is shown and stored", async () => {
    const t = setup([
      { toolCalls: [call("c1", "rtmoney_list")] },
      { content: "Er zit € 12 in de spaarpot." },
      { toolCalls: [call("c2", "rtweather_forecast")] },
      { content: "Er zit € 12 in de spaarpot, en morgen regent het." },
    ]);
    const history = [question("Wat zit er in de spaarpot en wat is het weer morgen?")];
    assert.equal(await runAssistantLoop(history, t.deps), "done");
    assert.equal(t.shown(), "Er zit € 12 in de spaarpot, en morgen regent het.");
    const answers = t.saved.filter((message) => message.role === "assistant" && message.content);
    assert.deepEqual(answers.map((message) => message.content), ["Er zit € 12 in de spaarpot, en morgen regent het."]);
    // The note went to the model as a user message after the first tool result, and stayed for the turn.
    const third = t.requests[2]?.messages ?? [];
    const note = third.at(-1);
    assert.ok(note?.role === "user" && typeof note.content === "string" && /part about Weather/.test(note.content));
    assert.equal(third.at(-2)?.role, "tool");
    assert.ok(t.requests[3]?.messages.some((message) => message.role === "user" && typeof message.content === "string" && message.content.includes("part about Weather")));
    // The weather tools were offered from the first step on (both parts routed).
    assert.ok(t.requests[0]?.tools?.some((tool) => tool.function.name === "rtweather_forecast"));
  });

  it("follows up at most once per turn", async () => {
    const t = setup([{ toolCalls: [call("c1", "rtmoney_list")] }, { content: "Er zit € 12 in." }, { content: "Nog altijd € 12." }]);
    assert.equal(await runAssistantLoop([question("Wat zit er in de spaarpot en wat is het weer?")], t.deps), "done");
    assert.equal(t.requests.length, 3);
    assert.equal(t.shown(), "Nog altijd € 12.");
  });

  it("streams as usual when every part was handled", async () => {
    const t = setup([{ toolCalls: [call("c1", "rtmoney_list"), call("c2", "rtweather_forecast")] }, { content: "€ 12, en droog weer." }]);
    assert.equal(await runAssistantLoop([question("Wat zit er in de spaarpot en wat is het weer?")], t.deps), "done");
    assert.equal(t.requests.length, 2);
    assert.ok(t.events.filter((event) => event.type === "text").length > 1, "streamed in pieces");
    assert.equal(t.shown(), "€ 12, en droog weer.");
  });

  it("shows a held-back answer that needs no follow-up", async () => {
    const t = setup([{ toolCalls: [call("c1", "rtmoney_list")] }, { content: "€ 12; het weer kan ik nu niet ophalen." }]);
    assert.equal(await runAssistantLoop([question("Wat zit er in de spaarpot en wat is het weer?")], t.deps), "done");
    assert.equal(t.requests.length, 2);
    assert.equal(t.shown(), "€ 12; het weer kan ik nu niet ophalen.");
  });

  it("leaves no room for a follow-up on the last steps", async () => {
    const t = setup([{ toolCalls: [call("c1", "rtmoney_list")] }, { content: "€ 12." }]);
    t.deps.maxSteps = 2;
    assert.equal(await runAssistantLoop([question("Wat zit er in de spaarpot en wat is het weer?")], t.deps), "done");
    assert.equal(t.requests.length, 2);
    assert.equal(t.shown(), "€ 12.");
  });
});

describe("the language of a question", () => {
  it("tells Dutch from English by common words, else the app language", () => {
    assert.equal(questionLanguage("Wat is de eerstvolgende betaling die dat ik me toen en wat is het weer morgen", "en"), "nl");
    assert.equal(questionLanguage("Open the gate, the delivery guy is here", "nl"), "en");
    assert.equal(questionLanguage("Fluvius?", "nl"), "nl");
    assert.equal(questionLanguage("Fluvius?", "en"), "en");
    assert.match(questionNoteFor("nl", new Date("2026-10-04T12:05:00Z"))("What is the weather?"), /^\(context, never repeat it: now \d{2}:\d{2}; answer in English\)$/);
    // A weekday in the question: the coming days' dates go with it, in its language.
    const note = questionNoteFor("en", new Date("2026-10-04T12:05:00Z"))("Voeg een taak toe tegen zaterdag");
    assert.match(note, /answer in Dutch; dates: maandag 2026-10-05, .*zaterdag 2026-10-10, zondag 2026-10-11\)$/);
  });
});

describe("token budgeting", () => {
  it("drops the oldest turns to fit the history budget, but keeps the current turn", () => {
    const history: LoopMessage[] = [];
    for (let index = 0; index < 10; index += 1) {
      history.push(question(`vraag ${index} ${"x".repeat(700)}`));
      history.push(msg({ role: "assistant", content: `antwoord ${index} ${"y".repeat(700)}` }));
    }
    history.push(question("de laatste vraag"));
    const messages = toChatMessages("system", history, { historyBudget: 1000 });
    const contents = messages.map((message) => (typeof message.content === "string" ? message.content : ""));
    assert.ok(contents.at(-1)?.startsWith("de laatste vraag"));
    assert.ok(!contents.some((content) => content.startsWith("vraag 0")), "oldest turn dropped");
    const historyTokens = messages.slice(1).reduce((sum, message) => sum + estimateTokens(JSON.stringify(message)), 0);
    assert.ok(historyTokens <= 1000, `history ${historyTokens} tokens`);
  });

  it("compacts long arguments and results of earlier turns, not of the current one", () => {
    const geometry = JSON.stringify({ points: Array.from({ length: 80 }, (_, index) => [index * 10, index * 20]) });
    const history: LoopMessage[] = [
      question("teken de keuken"),
      msg({ role: "assistant", content: "", toolCalls: [{ id: "g1", type: "function", function: { name: "places_draw", arguments: geometry } }] }),
      msg({ role: "tool", content: "", toolCallId: "g1", toolName: "places.draw", toolStatus: "done", toolResult: { ok: true, data: { plan: "z".repeat(3000) } } }),
      msg({ role: "assistant", content: "Klaar." }),
      question("en nu de badkamer"),
      msg({ role: "assistant", content: "", toolCalls: [{ id: "g2", type: "function", function: { name: "places_draw", arguments: geometry } }] }),
    ];
    const messages = toChatMessages("system", history);
    const calls = messages.flatMap((message) => (message.role === "assistant" && message.tool_calls ? message.tool_calls : []));
    assert.match(calls[0]?.function.arguments ?? "", /_omitted/);
    assert.equal(calls[1]?.function.arguments, geometry, "the current turn keeps its arguments");
    const oldResult = messages.find((message) => message.role === "tool");
    assert.ok(oldResult?.role === "tool" && oldResult.content.length < 700);
  });

  it("keeps the system prompt of a request small", () => {
    const prompt = buildSystemPrompt(user, { skills: [], active: [] });
    assert.ok(estimateTokens(prompt) < 600, `${estimateTokens(prompt)} tokens`);
  });
});
