/**
 * A fake OpenAI-compatible model server (the LM Studio API surface the assistant uses) for development and
 * runtime checks without a real model: `GET /v1/models`, `POST /v1/chat/completions` (streamed SSE or JSON),
 * answering by keyword so a check is deterministic:
 *
 *   "shopping list" / "what's on the list"  → calls shopping_list, then summarises the result
 *   "add <thing>"                            → calls shopping_add_item { name: <thing> }
 *   "spent <n>"                              → calls expenses_log (sensitive: the app must ask)
 *   "agenda" / "today"                       → calls calendar_agenda
 *   anything else                            → a plain streamed answer
 *
 * After a tool result it answers in text ("Done: …", or "OK, nothing changed." when the person cancelled).
 *
 *   npx tsx ai/eval/fake-openai-server.ts [port]          # default 11234
 *   ASSISTANT_BASE_URL=http://127.0.0.1:11234/v1 ASSISTANT_MODEL=fake-model npm run dev
 *
 * `GET /requests` lists the tool names of the last requests (to check what the model was offered);
 * `FAKE_NO_TOOLS=1` makes it refuse tools like a model without tool support.
 */
import { createServer, type ServerResponse } from "node:http";

const PORT = Number(process.argv[2] ?? process.env.FAKE_OPENAI_PORT ?? 11234);
const NO_TOOLS = process.env.FAKE_NO_TOOLS === "1";

type Message = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string };
type Body = { model?: string; messages?: Message[]; tools?: { function: { name: string } }[]; stream?: boolean };

const offered: string[][] = [];
let callCount = 0;

function reply(res: ServerResponse, stream: boolean, content: string, toolCall?: { name: string; args: unknown }) {
  callCount += 1;
  const call = toolCall && { index: 0, id: `call_${callCount}`, type: "function", function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) } };
  if (!stream) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content, ...(call && { tool_calls: [call] }) }, finish_reason: call ? "tool_calls" : "stop" }] }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const send = (delta: unknown, finish: string | null = null) => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  // Text in small pieces, like a real model.
  for (const piece of content.match(/.{1,6}/gs) ?? []) send({ content: piece });
  if (call) {
    // Tool calls arrive in fragments: the name first, then the arguments in two parts.
    const args = call.function.arguments;
    send({ tool_calls: [{ ...call, function: { name: call.function.name, arguments: "" } }] });
    send({ tool_calls: [{ index: 0, function: { arguments: args.slice(0, Math.ceil(args.length / 2)) } }] });
    send({ tool_calls: [{ index: 0, function: { arguments: args.slice(Math.ceil(args.length / 2)) } }] });
  }
  send({}, call ? "tool_calls" : "stop");
  res.end("data: [DONE]\n\n");
}

function answer(body: Body, res: ServerResponse) {
  const messages = body.messages ?? [];
  const tools = (body.tools ?? []).map((tool) => tool.function.name);
  offered.push(tools);
  if (offered.length > 20) offered.shift();
  if (NO_TOOLS && tools.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "This model does not support tools" } }));
    return;
  }
  const stream = body.stream !== false;
  const last = messages[messages.length - 1];
  if (last?.role === "tool") {
    const content = String(last.content ?? "");
    if (/cancelled|Not confirmed/i.test(content)) return reply(res, stream, "OK, nothing changed.");
    if (/"ok":false/.test(content)) return reply(res, stream, `That didn't work: ${content.slice(0, 120)}`);
    return reply(res, stream, `Done: ${content.slice(0, 160)}`);
  }
  // The app adds a note to the question ("…\n\n(context, never repeat it: now 14:05; answer in English)", and a
  // screen note when one is on): not part of what was asked, so everything from the first blank line goes.
  const question = String(last?.content ?? "")
    .split(/\n\s*\n/)[0]!
    .replace(/\s*\((?:context[^)]*|now \d{2}:\d{2})\)\s*$/, "")
    .trim()
    .toLowerCase();
  const has = (name: string) => tools.includes(name);
  if (/shopping list|on the list/.test(question) && has("shopping_list")) return reply(res, stream, "", { name: "shopping_list", args: {} });
  const add = question.match(/add (.+?)(?: to .*)?$/);
  if (add?.[1] && has("shopping_add_item")) return reply(res, stream, "Sure. ", { name: "shopping_add_item", args: { name: add[1].trim() } });
  const spent = question.match(/spent (\d+(?:[.,]\d+)?)/);
  if (spent?.[1] && has("expenses_log")) {
    return reply(res, stream, "", { name: "expenses_log", args: { payee: "Delhaize", amount: Number(spent[1].replace(",", ".")), category: "groceries" } });
  }
  if (/agenda|today/.test(question) && has("calendar_agenda")) return reply(res, stream, "", { name: "calendar_agenda", args: {} });
  return reply(res, stream, `Hello from the fake model. You said: ${question.slice(0, 80)}`);
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "fake-model", object: "model" }] }));
      return;
    }
    if (req.method === "GET" && req.url === "/requests") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(offered));
      return;
    }
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      try {
        answer(JSON.parse(raw || "{}") as Body, res);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "bad request" } }));
      }
      return;
    }
    res.writeHead(404).end();
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Fake OpenAI-compatible server on http://127.0.0.1:${PORT}/v1 (model "fake-model")`));
