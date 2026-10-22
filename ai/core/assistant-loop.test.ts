/**
 * The tool-call loop with a fake model and an in-memory store: a read tool answer, a write that pauses for
 * a confirmation and resumes (confirm, cancel, "don't ask again"), invalid arguments, unknown tools, roles,
 * a model without tool support and the step limit. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/assistant-loop.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";
import { z } from "zod";
import type { AssistantStreamEvent } from "@/features/assistant/types/assistant";
import type { SessionUser } from "@/features/auth/types/auth";
import { ACT_NOW_NOTE, ANSWER_NOW_NOTE, FAILURE_NOTE, FALLBACK_ANSWER, announcesAction, REPEATED_CALL_ERROR, cancelPending, resolveConfirmation, runAssistantLoop, toChatMessages, type LoopDeps, type LoopMessage } from "./assistant-loop";
import { ModelError, type ChatModel, type ChatRequest, type ChatResult } from "./llm-client";
import { registerAssistantTool, toolsFor, unregisterAssistantTool, type RegisteredAssistantTool } from "./tools";

const user = (role: SessionUser["role"] = "adult"): SessionUser => ({
  id: "u1",
  email: "rob@example.com",
  name: "Rob",
  role,
  locale: "en",
  householdId: "h1",
  householdName: "Test",
  habitantId: "hab1",
});

const shoppingList: string[] = [];
const expenses: number[] = [];

const tools = [
  registerAssistantTool({
    name: "looptest.list",
    description: "List the shopping list.",
    input: z.object({}),
    permission: "read",
    confirm: "never",
    activity: { en: "Checked the list", nl: "Lijst bekeken" },
    run: () => ({ items: [...shoppingList] }),
  }),
  registerAssistantTool({
    name: "looptest.add",
    description: "Add an item.",
    input: z.object({ name: z.string().min(1) }),
    permission: "write",
    confirm: "first-time",
    roles: ["owner", "adult", "child"],
    activity: { en: "Added", nl: "Toegevoegd" },
    describe: (_ctx, input) => `Add ${input.name}`,
    run: (_ctx, input) => {
      shoppingList.push(input.name);
      return { added: input.name };
    },
  }),
  registerAssistantTool({
    name: "looptest.pay",
    description: "Log an expense.",
    input: z.object({ euros: z.number().positive() }),
    permission: "sensitive",
    confirm: "always",
    activity: { en: "Logged", nl: "Genoteerd" },
    run: (_ctx, input) => {
      expenses.push(input.euros);
      return { logged: input.euros };
    },
  }),
];
after(() => tools.forEach((tool) => unregisterAssistantTool(tool.name)));

type Step = Partial<ChatResult> | ((request: ChatRequest) => Partial<ChatResult> | Promise<Partial<ChatResult>>);

/** A model that answers with the given steps in order, streaming the text in two pieces. */
function fakeModel(steps: Step[]) {
  const requests: ChatRequest[] = [];
  const model: ChatModel = async (request) => {
    requests.push(request);
    const step = steps.shift();
    if (!step) throw new Error("The fake model ran out of answers");
    const result = typeof step === "function" ? await step(request) : step;
    const content = result.content ?? "";
    if (content) {
      request.onText?.(content.slice(0, 3));
      request.onText?.(content.slice(3));
    }
    return { content, toolCalls: result.toolCalls ?? [], finishReason: result.finishReason ?? "stop" };
  };
  return { model, requests };
}

const call = (id: string, name: string, args: unknown) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });

function harness(model: ChatModel, options: { role?: SessionUser["role"]; skips?: string[]; maxSteps?: number } = {}) {
  const history: LoopMessage[] = [];
  const events: AssistantStreamEvent[] = [];
  const remembered: string[] = [];
  let id = 0;
  const loopTools: RegisteredAssistantTool[] = toolsFor(options.role ?? "adult").filter((tool) => tool.name.startsWith("looptest."));
  const deps: LoopDeps = {
    model,
    tools: loopTools,
    ctx: { user: user(options.role), householdId: "h1", locale: "en", signal: new AbortController().signal, channel: "chat" },
    systemPrompt: "You are a test.",
    rememberedSkips: new Set(options.skips ?? []),
    maxSteps: options.maxSteps,
    emit: (event) => events.push(event),
    save: async (message) => ({ ...message, id: `m${(id += 1)}` }),
    update: async () => undefined,
    remember: async (name) => {
      remembered.push(name);
    },
  };
  const ask = (content: string) => history.push({ id: `q${(id += 1)}`, role: "user", content });
  return { history, events, remembered, deps, ask };
}

const text = (events: AssistantStreamEvent[]) => events.flatMap((event) => (event.type === "text" ? [event.text] : [])).join("");

describe("announcesAction", () => {
  it("spots an answer that only says what it is about to do", () => {
    assert.equal(announcesAction("Ik begrijp het.\n\nIk ga de **Zithoek** nu aan de westkant van de keuken plaatsen."), true);
    assert.equal(announcesAction("Ik begin direct met het tekenen van de Keuken + Eethoek."), true);
    assert.equal(announcesAction("I'll draw the kitchen now."), true);
  });

  it("not for a real answer or a question", () => {
    assert.equal(announcesAction("De keuken is getekend: 3,72 × 8,19 m."), false);
    assert.equal(announcesAction("Zal ik de zithoek links onderaan tekenen?"), false);
    assert.equal(announcesAction("Je hebt 3 taken voor vandaag."), false);
  });
});

describe("runAssistantLoop", () => {
  it("an answer that only announces an action is nudged once to do it", async () => {
    shoppingList.splice(0, shoppingList.length);
    const { model, requests } = fakeModel([
      { content: "Ik ga nu melk op de lijst zetten." },
      (request) => {
        assert.ok(request.messages.some((message) => message.role === "user" && message.content === ACT_NOW_NOTE));
        return { toolCalls: [call("c1", "looptest_list", {})] };
      },
      { content: "Ik ga het nu nog eens doen." },
    ]);
    const h = harness(model);
    h.ask("Zet melk op de lijst");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.equal(requests.length, 3, "nudged once, not again");
  });

  it("a model that times out leaves a note in the conversation (not for Stop)", async () => {
    const { model } = fakeModel([
      () => {
        throw new ModelError("timeout", "The model took too long to answer");
      },
    ]);
    const h = harness(model);
    h.ask("Hi");
    assert.equal(await runAssistantLoop(h.history, h.deps), "error");
    assert.equal(h.history.at(-1)?.content, FAILURE_NOTE.timeout.en);
  });

  it("answers in text without tools", async () => {
    const { model } = fakeModel([{ content: "Hello Rob" }]);
    const h = harness(model);
    h.ask("Hi");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.equal(text(h.events), "Hello Rob");
    assert.equal(h.history.at(-1)?.role, "assistant");
  });

  it("runs a read tool and answers with its result", async () => {
    shoppingList.splice(0, shoppingList.length, "milk", "bread");
    const { model, requests } = fakeModel([
      { toolCalls: [call("c1", "looptest_list", {})] },
      (request) => {
        const toolMessage = request.messages.find((message) => message.role === "tool");
        assert.ok(toolMessage && toolMessage.role === "tool" && toolMessage.content.includes("milk"));
        return { content: "You need milk and bread." };
      },
    ]);
    const h = harness(model);
    h.ask("What's on the list?");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.equal(text(h.events), "You need milk and bread.");
    const chip = h.events.find((event) => event.type === "tool" && event.status === "done");
    assert.ok(chip && chip.type === "tool" && chip.label === "Checked the list");
    // Tools go to the model as OpenAI functions.
    assert.equal(requests[0]?.tools?.some((tool) => tool.function.name === "looptest_list"), true);
  });

  it("pauses a write for confirmation, then runs it after Confirm and continues", async () => {
    shoppingList.splice(0);
    const { model } = fakeModel([{ content: "Sure.", toolCalls: [call("c1", "looptest_add", { name: "eggs" })] }, { content: "Eggs are on the list." }]);
    const h = harness(model);
    h.ask("Add eggs");
    assert.equal(await runAssistantLoop(h.history, h.deps), "paused");
    assert.deepEqual(shoppingList, [], "nothing changed before the confirmation");
    const confirm = h.events.find((event) => event.type === "confirm");
    assert.ok(confirm && confirm.type === "confirm");
    assert.equal(confirm.summary, "Add eggs");
    assert.equal(confirm.allowRemember, true);

    // The person confirms, ticking "don't ask again".
    assert.equal(await resolveConfirmation(h.history, confirm.messageId, { decision: "confirm", remember: true }, h.deps), "done");
    assert.deepEqual(shoppingList, ["eggs"]);
    assert.deepEqual(h.remembered, ["looptest.add"]);
    assert.match(text(h.events), /Eggs are on the list\./);
    const pending = h.history.find((message) => message.id === confirm.messageId);
    assert.equal(pending?.toolStatus, "done");
  });

  it("shows a preview of the change on the confirmation card", async () => {
    const preview = registerAssistantTool({
      name: "looptest.plan",
      description: "Draw rooms.",
      input: z.object({ rooms: z.array(z.tuple([z.number(), z.number()])).max(10) }),
      permission: "write",
      confirm: "always",
      activity: { en: "Drew", nl: "Getekend" },
      preview: (_ctx, input) => ({ kind: "list", data: { items: input.rooms.map(([w, d]) => ({ label: `${w} × ${d}`, tone: "add" })) } }),
      run: () => ({ done: "drawn" }),
    });
    try {
      const { model } = fakeModel([{ toolCalls: [call("c1", "looptest_plan", { rooms: [[400, 300]] })] }]);
      const h = harness(model);
      h.deps.tools = [...h.deps.tools, preview];
      h.ask("Draw a 4 by 3 room");
      assert.equal(await runAssistantLoop(h.history, h.deps), "paused");
      const confirm = h.events.find((event) => event.type === "confirm");
      assert.ok(confirm && confirm.type === "confirm");
      assert.deepEqual(confirm.preview, { kind: "list", data: { items: [{ label: "400 × 300", tone: "add" }] } });
    } finally {
      unregisterAssistantTool(preview.name);
    }
  });

  it("runs a remembered harmless write without asking", async () => {
    shoppingList.splice(0);
    const { model } = fakeModel([{ toolCalls: [call("c1", "looptest_add", { name: "jam" })] }, { content: "Done." }]);
    const h = harness(model, { skips: ["looptest.add"] });
    h.ask("Add jam");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.deepEqual(shoppingList, ["jam"]);
    assert.ok(!h.events.some((event) => event.type === "confirm"));
  });

  it("always asks for sensitive tools, even when remembered; Cancel changes nothing and tells the model", async () => {
    expenses.splice(0);
    const { model } = fakeModel([
      { toolCalls: [call("c1", "looptest_pay", { euros: 45 })] },
      (request) => {
        const result = request.messages.find((message) => message.role === "tool");
        assert.ok(result && result.role === "tool" && result.content.includes("cancelled"));
        return { content: "OK, I didn't log it." };
      },
    ]);
    const h = harness(model, { skips: ["looptest.pay"] });
    h.ask("I spent 45 euro");
    assert.equal(await runAssistantLoop(h.history, h.deps), "paused");
    const confirm = h.events.find((event) => event.type === "confirm");
    assert.ok(confirm && confirm.type === "confirm");
    assert.equal(confirm.allowRemember, false);
    assert.equal(await resolveConfirmation(h.history, confirm.messageId, { decision: "cancel" }, h.deps), "done");
    assert.deepEqual(expenses, []);
    assert.equal(h.history.find((message) => message.id === confirm.messageId)?.toolStatus, "cancelled");
  });

  it("refuses to resolve something that isn't pending", async () => {
    const { model } = fakeModel([]);
    const h = harness(model);
    await assert.rejects(resolveConfirmation(h.history, "nope", { decision: "confirm" }, h.deps));
  });

  it("feeds invalid arguments and unknown tools back to the model as errors", async () => {
    const { model } = fakeModel([
      { toolCalls: [call("c1", "looptest_add", { name: "" }), call("c2", "looptest_nope", {}), { id: "c3", type: "function", function: { name: "looptest_list", arguments: "{bad" } }] },
      (request) => {
        const results = request.messages.filter((message) => message.role === "tool").map((message) => (message.role === "tool" ? message.content : ""));
        assert.match(results[0] ?? "", /Invalid arguments/);
        assert.match(results[1] ?? "", /Unknown tool/);
        assert.match(results[2] ?? "", /not valid JSON/);
        return { content: "Sorry." };
      },
    ]);
    const h = harness(model);
    h.ask("Do things");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
  });

  it("doesn't offer tools a child may not use", async () => {
    const { model, requests } = fakeModel([{ toolCalls: [call("c1", "looptest_pay", { euros: 3 })] }, { content: "I can't do that." }]);
    const h = harness(model, { role: "child" });
    h.ask("Log 3 euro");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.equal(requests[0]?.tools?.some((tool) => tool.function.name === "looptest_pay"), false);
    assert.ok(!h.events.some((event) => event.type === "confirm"));
  });

  it("falls back to a plain chat when the model has no tool support", async () => {
    const { model, requests } = fakeModel([
      () => {
        throw new ModelError("no_tools", "no tools");
      },
      { content: "Hi without tools" },
    ]);
    const h = harness(model);
    h.ask("Hi");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.ok(h.events.some((event) => event.type === "notice" && event.code === "no_tools"));
    assert.equal(requests[1]?.tools, undefined);
  });

  it("stops calling tools at the step limit and asks for a final answer", async () => {
    const loop = () => ({ toolCalls: [call(`c${Math.random()}`, "looptest_list", {})] });
    const { model, requests } = fakeModel([loop, loop, { content: "Here is what I found." }]);
    const h = harness(model, { maxSteps: 2 });
    h.ask("Loop");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.ok(h.events.some((event) => event.type === "notice" && event.code === "max_steps"));
    assert.equal(requests[2]?.toolChoice, "none", "the last step must answer in text");
    assert.ok(requests[2]?.messages.some((message) => message.role === "user" && message.content === ANSWER_NOW_NOTE));
    assert.ok(!requests[2]?.tools?.some((tool) => tool.function.name === "looptest_list"), "the repeated tool isn't offered again");
  });

  it("reports a model failure as an error event and one server log line without the question", async () => {
    const { model } = fakeModel([
      { toolCalls: [call("c1", "looptest_list", {})] },
      () => {
        throw new ModelError("timeout", "The model took too long to answer");
      },
    ]);
    const h = harness(model);
    h.deps.log = { conversationId: "conv1", model: "gemma" };
    h.ask("What is my secret shopping list?");
    const warn = mock.method(console, "warn", () => undefined);
    try {
      assert.equal(await runAssistantLoop(h.history, h.deps), "error");
    } finally {
      warn.mock.restore();
    }
    assert.ok(h.events.some((event) => event.type === "error" && event.code === "timeout"));
    const lines = warn.mock.calls.map((entry) => entry.arguments);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.[0], "[assistant] turn failed");
    assert.deepEqual(lines[0]?.[1], { conversationId: "conv1", step: 2, model: "gemma", error: "timeout: The model took too long to answer" });
    assert.ok(!JSON.stringify(lines).includes("secret"), "never the person's text");
  });

  it("logs a tool call with invalid JSON (the turn goes on)", async () => {
    const { model } = fakeModel([{ toolCalls: [{ id: "c1", type: "function", function: { name: "looptest_list", arguments: "{bad" } }] }, { content: "Sorry." }]);
    const h = harness(model);
    h.ask("List");
    const warn = mock.method(console, "warn", () => undefined);
    try {
      assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    } finally {
      warn.mock.restore();
    }
    assert.equal(warn.mock.calls[0]?.arguments[0], "[assistant] invalid tool call");
  });
});

describe("a model that goes wrong", () => {
  it("doesn't run the same call twice in a turn, and tells the model to answer", async () => {
    let runs = 0;
    const counted = registerAssistantTool({
      name: "looptest.count",
      description: "Count.",
      input: z.object({ room: z.string().optional(), filter: z.string().optional() }),
      permission: "read",
      confirm: "never",
      activity: { en: "Counted", nl: "Geteld" },
      run: () => ({ runs: (runs += 1) }),
    });
    try {
      const same = () => ({ toolCalls: [call(`c${Math.random()}`, "looptest_count", { filter: "all", room: "Badkamer" })] });
      const { model, requests } = fakeModel([
        { toolCalls: [call("c0", "looptest_count", { room: "Badkamer", filter: "all" })] },
        same,
        (request) => {
          const last = request.messages.at(-1);
          assert.ok(last?.role === "tool" && last.content.includes("already called this with the same arguments"));
          assert.equal(request.toolChoice, undefined, "one repeat: it may still call other tools");
          assert.ok(!request.tools?.some((tool) => tool.function.name === "looptest_count"), "but not that one");
          return { content: "One run." };
        },
      ]);
      const h = harness(model);
      h.deps.tools = [...h.deps.tools, counted];
      h.ask("Count the bathroom");
      assert.equal(await runAssistantLoop(h.history, h.deps), "done");
      assert.equal(runs, 1);
      assert.equal(requests.length, 3);
      assert.equal(requests[2]?.reasoning, true, "a model going in circles gets to reason");
      assert.equal(h.history.filter((message) => message.role === "tool").at(-1)?.toolResult?.ok, false);
      assert.match(REPEATED_CALL_ERROR, /already/);
    } finally {
      unregisterAssistantTool(counted.name);
    }
  });

  it("asks once more, with reasoning, after an answer without any text", async () => {
    const { model, requests } = fakeModel([{ content: "" }, { content: "Hello Rob" }]);
    const h = harness(model);
    h.ask("Hi");
    assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    assert.equal(requests[0]?.reasoning, undefined);
    assert.equal(requests[1]?.reasoning, true);
    assert.equal(text(h.events), "Hello Rob");
    assert.equal(h.history.filter((message) => message.role === "assistant").length, 1, "the empty answer isn't stored");
  });

  it("answers with a short fallback instead of staying silent when the model gives no text at all", async () => {
    const { model } = fakeModel([{ content: "" }, { content: "" }]);
    const h = harness(model);
    h.ask("Hi");
    const warn = mock.method(console, "warn", () => undefined);
    try {
      assert.equal(await runAssistantLoop(h.history, h.deps), "done");
    } finally {
      warn.mock.restore();
    }
    assert.equal(text(h.events), FALLBACK_ANSWER.en);
    assert.ok(!h.events.some((event) => event.type === "error"));
    assert.equal(h.history.at(-1)?.content, FALLBACK_ANSWER.en, "stored like any answer");
    assert.equal(warn.mock.calls[0]?.arguments[0], "[assistant] fallback answer");
  });

  it("makes a model that keeps repeating a call answer in text, with what it found", async () => {
    let runs = 0;
    const counted = registerAssistantTool({
      name: "looptest.find",
      description: "Find.",
      input: z.object({ contact: z.string() }),
      permission: "read",
      confirm: "never",
      activity: { en: "Found", nl: "Gevonden" },
      run: () => ({ runs: (runs += 1), name: "Waterwerken Janssens" }),
    });
    try {
      const again = () => ({ toolCalls: [call(`c${Math.random()}`, "looptest_find", { contact: "Janssens" })] });
      const { model, requests } = fakeModel([
        again,
        again,
        again,
        (request) => {
          assert.equal(request.toolChoice, "none", "two repeats: answer now");
          assert.equal(request.messages.at(-1)?.content, ANSWER_NOW_NOTE);
          // The model still tries a call: it is ignored, the text is the answer.
          return { content: "Dat mag alleen een volwassene.", toolCalls: [call("c9", "looptest_find", { contact: "Janssens" })] };
        },
      ]);
      const h = harness(model);
      h.deps.tools = [...h.deps.tools, counted];
      h.ask("Verwijder de loodgieter");
      assert.equal(await runAssistantLoop(h.history, h.deps), "done");
      assert.equal(runs, 1, "run once, never again");
      assert.equal(requests.length, 4, "no more steps than needed");
      assert.equal(text(h.events), "Dat mag alleen een volwassene.");
      assert.equal(h.history.at(-1)?.toolCalls ?? null, null);
    } finally {
      unregisterAssistantTool(counted.name);
    }
  });

  it("never ends a turn without an answer at the step limit", async () => {
    let n = 0;
    const busy = () => ({ toolCalls: [call(`c${(n += 1)}`, "looptest_count2", { n })] });
    const counted = registerAssistantTool({
      name: "looptest.count2",
      description: "Count.",
      input: z.object({ n: z.number() }),
      permission: "read",
      confirm: "never",
      activity: { en: "Counted", nl: "Geteld" },
      run: () => ({ ok: true }),
    });
    try {
      // Different arguments every time (no repeat), then only tool calls on the last step, twice.
      const { model, requests } = fakeModel([busy, busy, busy, busy]);
      const h = harness(model, { maxSteps: 2 });
      h.deps.tools = [...h.deps.tools, counted];
      h.deps.ctx = { ...h.deps.ctx, locale: "nl" };
      h.ask("Tel");
      const warn = mock.method(console, "warn", () => undefined);
      try {
        assert.equal(await runAssistantLoop(h.history, h.deps), "done");
      } finally {
        warn.mock.restore();
      }
      assert.equal(requests.length, 4);
      assert.equal(requests[3]?.toolChoice, "none");
      assert.equal(text(h.events), FALLBACK_ANSWER.nl);
      assert.equal(warn.mock.calls[0]?.arguments[0], "[assistant] fallback answer");
    } finally {
      unregisterAssistantTool(counted.name);
    }
  });
});

describe("several tool calls in one answer", () => {
  it("runs them in order: reads at once, a write waits for its card; then continues with every result", async () => {
    shoppingList.splice(0, shoppingList.length, "milk");
    const { model, requests } = fakeModel([
      { toolCalls: [call("c1", "looptest_list", {}), call("c2", "looptest_add", { name: "eggs" }), call("c3", "looptest_list", { again: true })] },
      (request) => {
        const results = request.messages.flatMap((message) => (message.role === "tool" ? [message.tool_call_id] : []));
        assert.deepEqual(results, ["c1", "c2", "c3"], "results in the order of the calls");
        return { content: "You had milk; eggs are added." };
      },
    ]);
    const h = harness(model);
    h.ask("What's on the list, and add eggs");
    assert.equal(await runAssistantLoop(h.history, h.deps), "paused");
    assert.deepEqual(shoppingList, ["milk"], "the write waits");
    // Both reads ran; the write is pending; order kept.
    const tools = h.history.filter((message) => message.role === "tool");
    assert.deepEqual(
      tools.map((message) => [message.toolCallId, message.toolStatus]),
      [
        ["c1", "done"],
        ["c2", "pending"],
        ["c3", "done"],
      ],
    );
    const order = h.events.flatMap((event) => (event.type === "tool" ? [`${event.toolCallId}:${event.status}`] : event.type === "confirm" ? [`${event.toolCallId}:confirm`] : []));
    assert.deepEqual(order, ["c1:running", "c1:done", "c2:confirm", "c3:running", "c3:done"]);
    assert.equal(requests.length, 1, "no model call while the card waits");

    const confirm = h.events.find((event) => event.type === "confirm");
    assert.ok(confirm && confirm.type === "confirm");
    assert.equal(await resolveConfirmation(h.history, confirm.messageId, { decision: "confirm" }, h.deps), "done");
    assert.deepEqual(shoppingList, ["milk", "eggs"]);
    assert.match(text(h.events), /eggs are added/);
  });

  it("shows the cards of two writes one after the other", async () => {
    shoppingList.splice(0);
    expenses.splice(0);
    const { model } = fakeModel([{ toolCalls: [call("c1", "looptest_add", { name: "jam" }), call("c2", "looptest_pay", { euros: 5 })] }, { content: "Both done." }]);
    const h = harness(model);
    h.ask("Add jam and log 5 euro");
    assert.equal(await runAssistantLoop(h.history, h.deps), "paused");
    const cards = h.events.filter((event) => event.type === "confirm");
    assert.equal(cards.length, 2);
    const [first, second] = cards;
    assert.ok(first?.type === "confirm" && second?.type === "confirm");
    // Confirming the first runs it and waits for the second (no model call yet).
    assert.equal(await resolveConfirmation(h.history, first.messageId, { decision: "confirm" }, h.deps), "paused");
    assert.deepEqual(shoppingList, ["jam"]);
    assert.equal(await resolveConfirmation(h.history, second.messageId, { decision: "confirm" }, h.deps), "done");
    assert.deepEqual(expenses, [5]);
    assert.match(text(h.events), /Both done\./);
  });
});

describe("history", () => {
  it("answers forgotten confirmations as not confirmed", async () => {
    const history: LoopMessage[] = [{ id: "t1", role: "tool", content: "", toolCallId: "c1", toolName: "looptest.add", toolStatus: "pending" }];
    assert.equal(await cancelPending(history, { update: async () => undefined }), 1);
    assert.equal(history[0]?.toolStatus, "cancelled");
  });

  it("starts the model's context at a user message and includes tool results", () => {
    const messages = toChatMessages("system", [
      { id: "t0", role: "tool", content: "", toolCallId: "old", toolResult: { ok: true, data: 1 } },
      { id: "u1", role: "user", content: "Hi" },
      { id: "a1", role: "assistant", content: "", toolCalls: [call("c1", "looptest_list", {})] },
      { id: "t1", role: "tool", content: "", toolCallId: "c1", toolResult: { ok: true, data: { items: [] } } },
    ]);
    assert.deepEqual(
      messages.map((message) => message.role),
      ["system", "user", "assistant", "tool"],
    );
  });
});
