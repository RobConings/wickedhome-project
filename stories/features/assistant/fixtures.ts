import type { AssistantClient } from "@/features/assistant/data/assistant-client";
import type { McpOAuthClient } from "@/features/assistant/data/mcp-oauth-client";
import type { ChatItem } from "@/features/assistant/data/chat-state";
import type {
  AssistantAccessToken,
  AssistantConversationDetail,
  AssistantConversationSummary,
  AssistantStatus,
  AssistantStreamEvent,
  AssistantTtsStatus,
} from "@/features/assistant/types/assistant";
import type { McpOAuthConsent, McpOAuthOverview } from "@/features/assistant/types/mcp-oauth";

export const notConfiguredStatus: AssistantStatus = {
  configured: false,
  problem: "missing_url",
  host: null,
  model: null,
  stt: false,
  tools: [],
};

export const configuredStatus: AssistantStatus = {
  configured: true,
  problem: null,
  host: "192.168.1.20:1234",
  model: "qwen2.5-7b-instruct",
  stt: false,
  tools: [
    { name: "calendar.agenda", permission: "read", activity: "Checked the agenda" },
    { name: "tasks.list_open", permission: "read", activity: "Checked the tasks" },
    { name: "shopping.list", permission: "read", activity: "Checked the shopping list" },
    { name: "shopping.add_item", permission: "write", activity: "Added to the shopping list" },
    { name: "tasks.complete", permission: "write", activity: "Marked a task done" },
    { name: "expenses.log", permission: "sensitive", activity: "Logged an expense" },
    { name: "alarm.arm_away", permission: "sensitive", activity: "Armed the alarm (away)" },
  ],
  skills: [
    {
      id: "tasks",
      title: "Tasks",
      summary: "Household to-dos and recurring chores: what is open or overdue, add, complete, who is on duty.",
      tools: [
        { name: "tasks.list_open", permission: "read", confirm: "never", activity: "Checked the tasks", core: true },
        { name: "tasks.add", permission: "write", confirm: "first-time", activity: "Added a task", core: false },
        { name: "tasks.complete", permission: "write", confirm: "first-time", activity: "Marked a task done", core: false },
      ],
    },
    {
      id: "expenses",
      title: "Expenses and bills",
      summary: "Bills and recurring payments (energy, loan, insurance, subscriptions): what is due, log spending, payees, payment accounts.",
      tools: [
        { name: "expenses.due", permission: "read", confirm: "never", activity: "Checked what's due to pay", core: false },
        { name: "expenses.log", permission: "sensitive", confirm: "always", activity: "Logged an expense", core: false },
      ],
    },
    {
      id: "alarm",
      title: "Alarm",
      summary: "The house alarm: status and arming (home or away). Disarming is never possible here.",
      tools: [
        { name: "alarm.status", permission: "read", confirm: "never", activity: "Checked the alarm", core: false },
        { name: "alarm.arm_away", permission: "sensitive", confirm: "always", activity: "Armed the alarm (away)", core: false },
      ],
    },
  ],
};

/** Piper on the home server with two Flemish and two British voices. */
export const ttsStatusFixture: AssistantTtsStatus = {
  configured: true,
  ok: true,
  kind: "piper",
  host: "127.0.0.1:5005",
  problem: null,
  voices: [
    { id: "en_GB-alba-medium", locale: "en" },
    { id: "en_GB-northern_english_male-medium", locale: "en" },
    { id: "nl_BE-nathalie-medium", locale: "nl" },
    { id: "nl_BE-rdh-medium", locale: "nl" },
  ],
  defaults: { nl: "nl_BE-nathalie-medium", en: "en_GB-alba-medium" },
};

export const configuredWithVoiceStatus: AssistantStatus = { ...configuredStatus, stt: true, tts: ttsStatusFixture };

/** A short two-note chime as a WAV, standing in for the speech server's audio. */
export function chimeWav(seconds = 0.8): Blob {
  const rate = 22_050;
  const samples = Math.round(rate * seconds);
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) {
    const time = index / rate;
    const frequency = time < seconds / 2 ? 660 : 880;
    const fade = Math.min(1, (seconds - time) * 8, time * 50);
    view.setInt16(44 + index * 2, Math.sin(2 * Math.PI * frequency * time) * 8000 * fade, true);
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

export const conversationsFixture: AssistantConversationSummary[] = [
  { id: "c1", title: "What's on today?", lastMessageAt: "2026-10-03T07:45:00Z", createdAt: "2026-10-03T07:44:00Z" },
  { id: "c2", title: "Shopping for the weekend", lastMessageAt: "2026-10-02T17:10:00Z", createdAt: "2026-10-02T17:05:00Z" },
  { id: "c3", title: null, lastMessageAt: "2026-09-28T19:00:00Z", createdAt: "2026-09-28T19:00:00Z" },
];

export const conversationFixture: AssistantConversationDetail = {
  ...conversationsFixture[0]!,
  messages: [
    { id: "m1", role: "user", content: "What's on today?", createdAt: "2026-10-03T07:44:00Z", tool: null },
    {
      id: "m2",
      role: "tool",
      content: "",
      createdAt: "2026-10-03T07:44:02Z",
      tool: { name: "calendar.agenda", status: "done", summary: "Checked the agenda", permission: "read", allowRemember: false, error: null },
    },
    {
      id: "m3",
      role: "assistant",
      content: "Today:\n- 08:30 Dentist for Lotte\n- **PMD** goes out tonight\n- Electricity bill (€ 84,20) is due",
      createdAt: "2026-10-03T07:44:05Z",
      tool: null,
    },
    { id: "m4", role: "user", content: "Put milk and eggs on the list", createdAt: "2026-10-03T07:45:00Z", tool: null },
    {
      id: "m5",
      role: "tool",
      content: "",
      createdAt: "2026-10-03T07:45:02Z",
      tool: { name: "shopping.add_item", status: "pending", summary: "Put milk on the shopping list", permission: "write", allowRemember: true, error: null },
    },
  ],
};

/** Every kind of chat item at once. */
export const allItemsFixture: ChatItem[] = [
  { kind: "user", key: "1", text: "What do we have to pay this week?" },
  { kind: "tool", key: "2", toolCallId: "c1", messageId: "2", name: "expenses.due", status: "done", label: "Checked what's due to pay", error: null },
  { kind: "assistant", key: "3", text: "Two things this week:\n- **Fluvius** € 84,20 on Tuesday (direct debit)\n- **Telenet** € 69,00 on Friday", streaming: false },
  { kind: "user", key: "4", text: "I spent 45 euro at Delhaize" },
  { kind: "confirm", key: "5", messageId: "5", name: "expenses.log", summary: "Log € 45,00 at Delhaize on Sat 3 Oct (joint account)", permission: "sensitive", allowRemember: false, submitting: null },
];

export const toolChipsFixture: ChatItem[] = [
  { kind: "user", key: "1", text: "Add a task for Clara and check the weather" },
  { kind: "tool", key: "2", toolCallId: "a", messageId: "2", name: "weather.forecast", status: "done", label: "Checked the weather", error: null },
  { kind: "tool", key: "3", toolCallId: "b", messageId: "3", name: "tasks.add", status: "failed", label: "Added a task", error: "No habitant called \"Cindi\"" },
  { kind: "tool", key: "4", toolCallId: "c", messageId: "4", name: "shopping.add_item", status: "cancelled", label: "Added to the shopping list", error: null },
  { kind: "tool", key: "5", toolCallId: "d", messageId: null, name: "calendar.agenda", status: "running", label: "Checked the agenda", error: null },
];

export const streamingFixture: ChatItem[] = [
  { kind: "user", key: "1", text: "Which bin goes out next?" },
  { kind: "tool", key: "2", toolCallId: "a", messageId: "2", name: "waste.next_collection", status: "done", label: "Checked the waste collection", error: null },
  { kind: "assistant", key: "3", text: "Tonight: **PMD** and paper. Next week Thursday the", streaming: true },
];

export const noticesFixture: ChatItem[] = [
  { kind: "user", key: "1", text: "What's on today?" },
  { kind: "notice", key: "2", code: "no_tools" },
  { kind: "assistant", key: "3", text: "I can't look at your agenda with this model, sorry.", streaming: false },
  { kind: "user", key: "4", text: "Hello?" },
  { kind: "error", key: "5", code: "unreachable", message: "The model server could not be reached" },
];

export const tokensFixture: AssistantAccessToken[] = [
  { id: "t1", name: "Claude on my laptop", prefix: "wh_mcp_Ab3x", scope: "read", lastUsedAt: "2026-10-02T20:00:00Z", createdAt: "2026-09-20T10:00:00Z" },
  { id: "t2", name: "Home Assistant", prefix: "wh_mcp_9QzT", scope: "write", lastUsedAt: null, createdAt: "2026-10-01T10:00:00Z" },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Emits events with a small delay each, like a streaming model. */
async function play(events: AssistantStreamEvent[], onEvent: (event: AssistantStreamEvent) => void, signal: AbortSignal) {
  for (const event of events) {
    if (signal.aborted) return;
    await wait(event.type === "text" ? 60 : 400);
    onEvent(event);
  }
}

const words = (text: string): AssistantStreamEvent[] => (text.match(/\S+\s*/g) ?? []).map((piece) => ({ type: "text", text: piece }));

/**
 * A fake client for stories: questions get a scripted streamed answer; "add …" asks for a confirmation
 * first. Pass overrides to change one call.
 */
export function fakeAssistantClient(overrides: Partial<AssistantClient> = {}): AssistantClient {
  let tokens = [...tokensFixture];
  return {
    status: async () => configuredStatus,
    test: async () => {
      await wait(700);
      return { reachable: true, latencyMs: 812, models: ["qwen2.5-7b-instruct"], modelListed: true, error: null };
    },
    listConversations: async () => conversationsFixture,
    getConversation: async () => conversationFixture,
    renameConversation: async (id, title) => ({ ...conversationsFixture[0]!, id, title }),
    deleteConversation: async () => undefined,
    send: async (conversationId, input, onEvent, signal) => {
      const id = conversationId ?? "new-conversation";
      const start: AssistantStreamEvent = { type: "start", conversationId: id, userMessageId: "q", title: input.content };
      if (/^add /i.test(input.content)) {
        await play(
          [
            start,
            { type: "message", messageId: "a1", role: "assistant" },
            {
              type: "confirm",
              messageId: "t1",
              toolCallId: "c1",
              name: "shopping.add_item",
              summary: `Put ${input.content.slice(4)} on the shopping list`,
              permission: "write",
              allowRemember: true,
            },
            { type: "done", status: "paused" },
          ],
          onEvent,
          signal,
        );
        return;
      }
      await play(
        [
          start,
          { type: "tool", messageId: null, toolCallId: "c0", name: "calendar.agenda", status: "running", label: "Checked the agenda" },
          { type: "tool", messageId: "t0", toolCallId: "c0", name: "calendar.agenda", status: "done", label: "Checked the agenda" },
          ...words("Today: the dentist at 08:30 for Lotte, and PMD goes out tonight. Nothing else is planned."),
          { type: "message", messageId: "a2", role: "assistant" },
          { type: "done", status: "done" },
        ],
        onEvent,
        signal,
      );
    },
    confirm: async (_conversationId, messageId, input, onEvent, signal) => {
      const status = input.decision === "confirm" ? "done" : "cancelled";
      await play(
        [
          { type: "start", conversationId: "new-conversation", userMessageId: null, title: null },
          { type: "tool", messageId, toolCallId: "c1", name: "shopping.add_item", status, label: "Added to the shopping list" },
          ...words(input.decision === "confirm" ? "Done, it's on the list." : "OK, I left the list as it was."),
          { type: "message", messageId: "a3", role: "assistant" },
          { type: "done", status: "done" },
        ],
        onEvent,
        signal,
      );
    },
    transcribe: async () => {
      await wait(800);
      return "What's on today?";
    },
    voices: async () => {
      await wait(500);
      return ttsStatusFixture;
    },
    speech: async () => {
      await wait(700);
      return chimeWav();
    },
    listTokens: async () => tokens,
    createToken: async (input) => {
      await wait(400);
      const token = { id: `t${Date.now()}`, name: input.name, prefix: "wh_mcp_New1", scope: input.scope, lastUsedAt: null, createdAt: new Date().toISOString() };
      tokens = [token, ...tokens];
      return { ...token, token: "wh_mcp_New1example-token-shown-only-once-xxxxxxxxxxxx" };
    },
    revokeToken: async (id) => {
      tokens = tokens.filter((token) => token.id !== id);
    },
    resetPreferences: async () => undefined,
    attach: async () => false,
    stop: async () => undefined,
    uploadImage: async () => {
      await wait(400);
      return { id: `image-${Date.now().toString(36)}` };
    },
    ...overrides,
  };
}

/** A promise that never settles: the loading state. */
export const never = <T,>() => new Promise<T>(() => undefined);

// ── MCP OAuth (ai/docs/MCP-OAUTH.md) ──

/** An owner's view: two connected apps, DCR on with the default domains, one manual app. */
export const oauthOverviewFixture: McpOAuthOverview = {
  serverUrl: "https://home.example.be/api/mcp",
  connected: [
    {
      id: "g1",
      clientName: "ChatGPT",
      redirectHost: "chatgpt.com",
      kind: "dynamic",
      scope: "write",
      userId: "u1",
      person: "Rob",
      lastUsedAt: "2026-10-11T09:42:00.000Z",
      createdAt: "2026-10-10T18:00:00.000Z",
    },
    { id: "g2", clientName: "Claude", redirectHost: "claude.ai", kind: "dynamic", scope: "read", userId: "u2", person: "Clara", lastUsedAt: null, createdAt: "2026-10-11T08:00:00.000Z" },
  ],
  settings: { dcrEnabled: true, allowedHosts: ["chatgpt.com", "claude.ai"] },
  apps: [
    {
      id: "a1",
      clientId: "wh_client_Yk3v9QpL2mXr8TfB",
      name: "My agent",
      redirectUris: ["https://agent.example.com/oauth/callback"],
      confidential: true,
      lastUsedAt: "2026-10-09T20:15:00.000Z",
      createdAt: "2026-10-01T12:00:00.000Z",
    },
  ],
};

/** An adult's view: only their own connections, no settings or apps. */
export const oauthAdultOverviewFixture: McpOAuthOverview = { ...oauthOverviewFixture, connected: oauthOverviewFixture.connected.slice(1), settings: null, apps: null };

export const consentFixture: McpOAuthConsent = {
  clientName: "ChatGPT",
  kind: "dynamic",
  redirectHost: "chatgpt.com",
  requestedScopes: ["read", "write"],
  refused: null,
  csrf: "csrf-token",
  expiresAt: "2026-10-11T10:10:00.000Z",
};

export function fakeMcpOAuthClient(overrides: Partial<McpOAuthClient> = {}): McpOAuthClient {
  return {
    overview: async () => oauthOverviewFixture,
    disconnect: async () => wait(500).then(() => undefined),
    updateSettings: async (input) => {
      await wait(500);
      return { dcrEnabled: input.dcrEnabled ?? true, allowedHosts: input.allowedHosts ?? ["chatgpt.com", "claude.ai"] };
    },
    createApp: async (input) => ({
      id: "a2",
      clientId: "wh_client_N4pQ8sV1xZ6cR2tW",
      name: input.name,
      redirectUris: input.redirectUris,
      confidential: input.confidential,
      lastUsedAt: null,
      createdAt: "2026-10-11T10:00:00.000Z",
      clientSecret: input.confidential ? "wh_cs_9fK2mQ7xL4vB8nR1tY6pZ3cW5hJ0dS2aE8uG4iO7" : null,
    }),
    deleteApp: async () => wait(500).then(() => undefined),
    consent: async () => consentFixture,
    decide: async () => {
      await wait(600);
      return { redirectTo: "https://chatgpt.com/connector/oauth/abc?code=x&state=y" };
    },
    ...overrides,
  };
}
