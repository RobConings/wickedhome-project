import { z } from "zod";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import type { AssistantPreviewPayload } from "@/features/assistant/types/assistant";
import type { Locale } from "@/types/common";
import type { ScreenRef } from "@/types/screen-context";
import { HttpError } from "@/api/lib/http";

/**
 * The assistant's tool registry: every action the assistant (chat, voice) and the MCP server may take, each
 * one a thin wrapper around the same service function the UI's API route calls. Skills register their
 * tools from `ai/skills/<skill>/tools.ts` (imported once by ai/skills/index.ts); this file knows no skill.
 * How to write one: ai/docs/ADDING-TOOLS.md.
 *
 *   // ai/skills/shopping/tools.ts
 *   registerAssistantTool({
 *     name: "shopping.add_item",                                       // skill "shopping" (the part before the dot)
 *     description: "Add an item to the household shopping list.",       // English, for the model
 *     input: z.object({ name: z.string().min(1).max(80), shop: entityRef("shop").optional() }),
 *     permission: "write",
 *     confirm: "first-time",                                           // "don't ask again" allowed
 *     roles: ["owner", "adult", "child"],                              // children may add to the list
 *     activity: { en: "Added to the shopping list", nl: "Op de boodschappenlijst gezet" },
 *     describe: (ctx, input) => say(ctx.locale, `Add ${input.name} to the list`, `${input.name} op de lijst zetten`),
 *     run: async (ctx, input) => done(…(await createItem(ctx.user, { name: input.name, shopId: input.shop?.id }))),
 *   });
 *
 * Safety rules, enforced here so a feature can't get them wrong:
 * - `read` tools never ask; `write` tools ask `"first-time"` (until the person ticks "don't ask again") or
 *   `"always"`; `sensitive` tools (money, deletes, arming the alarm) always ask.
 * - Disarming the alarm (or unlocking anything) is never a tool: such names are refused outright.
 * - Writes default to owners and adults; pass `roles` to let children use a tool (the service still checks),
 *   and `refuse` when only some of its arguments are for children. Both are checked before anything runs.
 */

export type AssistantToolPermission = "read" | "write" | "sensitive";
export type AssistantToolConfirm = "never" | "first-time" | "always";
/** Where a call comes from: the chat (and voice) in the app, or an MCP client with a personal token. */
export type AssistantToolChannel = "chat" | "mcp";

export type AssistantToolContext = {
  user: SessionUser;
  householdId: string;
  locale: Locale;
  /** Aborted when the person stops the answer or the request ends: pass it on to slow work. */
  signal: AbortSignal;
  channel: AssistantToolChannel;
  /** Over MCP with an OAuth token: the connected app's name (e.g. "ChatGPT"), for the audit log. */
  via?: string;
  /**
   * The page the current question was asked from (screen context), only when it was found for this household.
   * Read it with `screenTarget(ctx, kind)` to default an omitted target; absent over MCP.
   */
  screen?: ScreenRef;
};

export type AssistantToolDefinition<Input extends z.ZodType = z.ZodType> = {
  /** `<feature>.<action>`, lowercase, e.g. `tasks.complete`. Becomes `tasks_complete` for the model. */
  name: string;
  /** What the tool does and when to use it, in English, for the model. Keep it short and concrete. */
  description: string;
  /** The arguments. Must be a `z.object`; field `.describe()` texts become the model's parameter docs. */
  input: Input;
  permission: AssistantToolPermission;
  confirm: AssistantToolConfirm;
  /** Who may use it. Default: everyone for read tools, owners and adults for the rest. */
  roles?: readonly Role[];
  /**
   * Argument-level role rules, for a tool that mixes what children may and may not do ("set a count is for
   * adults", "mail is not for children"): why this person may not make this call, or null. The runner checks
   * it on the validated arguments before any name is resolved, a confirmation is asked or `run` starts (chat
   * and MCP alike) and hands the reason to the model to relay. Names are not resolved yet: look only at plain
   * fields and whether a field is given. The service still checks.
   */
  refuse?: (ctx: AssistantToolContext, input: z.output<Input>) => string | null;
  /** The activity chip in the chat once it ran ("Checked the shopping list"), per language. */
  activity: Record<Locale, string>;
  /**
   * What will happen, in the person's language, for the confirmation card ("Add 2 × milk to the shopping
   * list"). May look things up (a task's title). Defaults to the activity text.
   */
  describe?: (ctx: AssistantToolContext, input: z.output<Input>) => string | Promise<string>;
  /** The work: call the feature's service. Return compact JSON (short summaries, not whole records). */
  run: (ctx: AssistantToolContext, input: z.output<Input>) => Promise<unknown> | unknown;
  /**
   * The feature's service writes its own audit entries for this action (the alarm records every attempt),
   * so the tool runner doesn't add one. Default: every successful write is recorded by the runner.
   */
  auditedByService?: boolean;
  /**
   * The skill this tool belongs to (ai/core/skills.ts): its tools are sent to the model only while the skill
   * is active in the conversation. Default: the part of the name before the dot (`tasks.add` → `tasks`).
   */
  skill?: string;
  /**
   * Always sent, whatever skill is active: only for the handful of tools nearly every conversation needs
   * (skills_load, search_everything, app_context, the most common reads). Each costs ~100 tokens per request.
   */
  core?: boolean;
  /**
   * Whether the tool can be offered right now, e.g. its server is configured (web search needs `SEARCH_URL`).
   * Checked on every request: an unavailable tool is left out of the model's tools, the skill index, routing
   * and MCP. Default: always available.
   */
  available?: () => boolean;
  /**
   * Writes only: a proposed change the confirmation card shows before Confirm, e.g. a floor-plan diff drawn
   * over the plan or the list of expenses that would be created. Computed from the (resolved) arguments
   * without changing anything; `null` for no preview. The UI renders it by `kind`
   * (src/features/assistant/components/previews); unknown kinds fall back to the summary.
   */
  preview?: (ctx: AssistantToolContext, input: z.output<Input>) => AssistantPreview | null | Promise<AssistantPreview | null>;
  /**
   * Writes only: what the person may decide on the card besides Confirm / Cancel (ai/docs/ADDING-TOOLS.md,
   * "Edits and choices"). `editable`: top-level argument names the person may change on the card (the
   * preview renderer shows the inputs, e.g. a mail's subject and body). `choices`: buttons that replace
   * Confirm, each writing its value into the argument `field` (e.g. Send / Save as draft into `action`).
   * The amended arguments are validated again by `input`, previewed again, then run and audited as they are.
   */
  confirmation?: AssistantToolConfirmation;
};

export type AssistantToolConfirmation = {
  editable?: readonly string[];
  choices?: { field: string; options: readonly { value: string; label: Record<Locale, string> }[] };
};

/** A renderable preview for a confirmation card (see `preview`). Keep `data` small: it is sent to the browser. */
export type AssistantPreview = AssistantPreviewPayload;

/** Records a successful write of a tool (set once by the assistant service; tests leave it unset). */
export type AssistantToolAuditor = (tool: RegisteredAssistantTool, ctx: AssistantToolContext, input: unknown) => Promise<void>;
let toolAuditor: AssistantToolAuditor | null = null;
export const setAssistantToolAuditor = (auditor: AssistantToolAuditor | null) => {
  toolAuditor = auditor;
};
/** Whether and how the runner records a tool call that succeeded: writes only, never throws. */
export async function auditToolCall(tool: RegisteredAssistantTool, ctx: AssistantToolContext, input: unknown): Promise<void> {
  if (tool.permission === "read" || tool.auditedByService || !toolAuditor) return;
  try {
    await toolAuditor(tool, ctx, input);
  } catch (error) {
    console.error(`Assistant tool "${tool.name}": audit failed`, error);
  }
}

export type RegisteredAssistantTool = AssistantToolDefinition & {
  roles: readonly Role[];
  /** The name as the model and MCP clients see it: dots become underscores (`tasks_complete`). */
  wireName: string;
  skill: string;
};

const TOOL_NAME = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/;
/** Never a tool, whatever a feature tries: disarming the alarm, unlocking doors, opening the garage… */
const FORBIDDEN_NAME = /disarm|unarm|unlock|deactivat|turn_off_alarm|alarm_off|open_door|open_garage/i;
const ALL_ROLES: readonly Role[] = ["owner", "adult", "child"];
const MANAGERS: readonly Role[] = ["owner", "adult"];

const tools = new Map<string, RegisteredAssistantTool>();

/** `tasks.complete` → `tasks_complete`; reversible because the feature part has no underscore. */
export const toWireName = (name: string) => name.replace(".", "_");
export const fromWireName = (wire: string) => wire.replace("_", ".");

/** Registers a tool. Throws on a bad name, a forbidden tool, or a permission/confirmation mismatch. */
export function registerAssistantTool<Input extends z.ZodType>(definition: AssistantToolDefinition<Input>): RegisteredAssistantTool {
  const { name, permission, confirm } = definition;
  if (!TOOL_NAME.test(name)) throw new Error(`Assistant tool "${name}" must look like "<feature>.<action>" (lowercase)`);
  if (!(definition.input instanceof z.ZodObject)) throw new Error(`Assistant tool "${name}": input must be a z.object`);
  // The name, and the values the arguments allow (an enum `mode: "disarmed"` is disarming too).
  if (FORBIDDEN_NAME.test(name) || FORBIDDEN_NAME.test(JSON.stringify(toolInputJsonSchema(definition)))) {
    throw new Error(`Assistant tool "${name}" is not allowed: disarming or unlocking is never exposed to the assistant`);
  }
  if (permission === "read" && confirm !== "never") throw new Error(`Assistant tool "${name}": read tools never ask`);
  if (permission !== "read" && confirm === "never") throw new Error(`Assistant tool "${name}": ${permission} tools must ask`);
  if (permission === "sensitive" && confirm !== "always") throw new Error(`Assistant tool "${name}": sensitive tools always ask`);
  if (name.startsWith("alarm.") && permission !== "read" && permission !== "sensitive") {
    throw new Error(`Assistant tool "${name}": alarm actions are sensitive`);
  }
  if (!definition.description.trim()) throw new Error(`Assistant tool "${name}" needs a description`);
  if (definition.preview && permission === "read") throw new Error(`Assistant tool "${name}": only writes have a confirmation preview`);
  if (definition.confirmation) {
    if (permission === "read") throw new Error(`Assistant tool "${name}": only writes have confirmation edits or choices`);
    const shape = (definition.input as unknown as z.ZodObject).shape as Record<string, unknown>;
    const { editable = [], choices } = definition.confirmation;
    for (const field of [...editable, ...(choices ? [choices.field] : [])]) {
      if (!(field in shape)) throw new Error(`Assistant tool "${name}": confirmation field "${field}" is not an argument`);
    }
    if (choices && choices.options.length < 2) throw new Error(`Assistant tool "${name}": confirmation choices need at least two options`);
  }

  const tool: RegisteredAssistantTool = {
    ...(definition as unknown as AssistantToolDefinition),
    roles: definition.roles ?? (permission === "read" ? ALL_ROLES : MANAGERS),
    wireName: toWireName(name),
    skill: definition.skill ?? name.split(".")[0] ?? name,
  };
  // Re-registering the same name replaces it (dev server reloads); two features must not share a name.
  tools.set(name, tool);
  return tool;
}

export const getAssistantTool = (name: string): RegisteredAssistantTool | undefined => tools.get(name);
export const getAssistantToolByWireName = (wire: string) => tools.get(fromWireName(wire));

/** Every registered tool, sorted by name. */
export const listAssistantTools = (): RegisteredAssistantTool[] => [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));

/** Tests only: forget a tool. */
export const unregisterAssistantTool = (name: string) => tools.delete(name);

export const canUseTool = (tool: RegisteredAssistantTool, role: Role) => tool.roles.includes(role);

/** The tool's own refusal of these (validated) arguments for this person (`refuse`), or null. */
export function refusalOf(tool: RegisteredAssistantTool, ctx: AssistantToolContext, input: unknown): string | null {
  return tool.refuse?.(ctx, input) ?? null;
}

/** The tools one person may use (by role), optionally only reads (read-only MCP tokens). */
export function toolsFor(role: Role, options: { readOnly?: boolean } = {}): RegisteredAssistantTool[] {
  return listAssistantTools().filter((tool) => canUseTool(tool, role) && isToolAvailable(tool) && (!options.readOnly || tool.permission === "read"));
}

/** See `available`: tools without the hook are always available; a hook that throws counts as unavailable. */
export function isToolAvailable(tool: Pick<RegisteredAssistantTool, "available">): boolean {
  try {
    return tool.available?.() ?? true;
  } catch {
    return false;
  }
}

/** Whether a tool needs the person's confirmation, given whether they ticked "don't ask again". */
export function needsConfirmation(tool: RegisteredAssistantTool, rememberedSkip: boolean): boolean {
  if (tool.confirm === "never") return false;
  if (tool.confirm === "first-time") return !rememberedSkip;
  return true;
}

/** "Don't ask again" is offered only for harmless writes. */
export const allowsRemember = (tool: RegisteredAssistantTool) => tool.permission === "write" && tool.confirm === "first-time";

/** What the card offers besides Confirm / Cancel, in the person's language (event and message `tool.edit`). */
export function confirmationOptionsOf(tool: RegisteredAssistantTool, locale: Locale): { editable: string[]; choices: { value: string; label: string }[] } | null {
  const options = tool.confirmation;
  if (!options || (!options.editable?.length && !options.choices)) return null;
  return {
    editable: [...(options.editable ?? [])],
    choices: (options.choices?.options ?? []).map((option) => ({ value: option.value, label: option.label[locale] ?? option.label.en })),
  };
}

export type JsonSchema = Record<string, unknown>;

/**
 * The tool's arguments as JSON Schema (draft 2020-12, the shape OpenAI function calling and MCP expect):
 * an object with `properties` and `required`. What the model may send in is the *input* side of the schema
 * (defaults make a field optional).
 */
export function toolInputJsonSchema(tool: Pick<AssistantToolDefinition, "input">): JsonSchema {
  const schema = z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as JsonSchema;
  delete schema.$schema;
  if (schema.type !== "object") return { type: "object", properties: {}, additionalProperties: false };
  schema.properties ??= {};
  return schema;
}

/**
 * Keys only the server's validation needs (zod checks them again when the tool runs): the local model reads
 * every tool on every call, and integers alone carried `minimum: -9007199254740991`. `pattern` and `enum` stay,
 * the server can use them to constrain what the model writes; ranges that matter are in the descriptions.
 */
const VALIDATION_ONLY = new Set(["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "format"]);

/**
 * A JSON schema without `VALIDATION_ONLY` keys, at any depth (property names are never touched), and with
 * tuples as plain arrays: zod writes `[x, y]` as `prefixItems` + `items: false`, and LM Studio's engine refuses
 * the whole request ("schema must be an object", 2026-10-09). `[number, number]` becomes `items: {number}`.
 */
export function slimSchema(value: unknown, isProperties = false): unknown {
  if (Array.isArray(value)) return value.map((item) => slimSchema(item));
  if (!value || typeof value !== "object") return value;
  const node = { ...(value as Record<string, unknown>) };
  if (!isProperties && Array.isArray(node.prefixItems)) {
    const [first, ...rest] = node.prefixItems;
    const same = rest.every((item) => JSON.stringify(item) === JSON.stringify(first));
    delete node.prefixItems;
    node.items = same && first !== undefined ? first : {};
  }
  if (!isProperties && typeof node.items === "boolean") delete node.items;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => isProperties || !VALIDATION_ONLY.has(key))
      .map(([key, child]) => [key, slimSchema(child, !isProperties && key === "properties")]),
  );
}

/** The `tools` array of an OpenAI-compatible `/chat/completions` request (MCP keeps the full schema). */
export function toOpenAiTools(list: RegisteredAssistantTool[]) {
  return list.map((tool) => ({
    type: "function" as const,
    function: { name: tool.wireName, description: tool.description, parameters: slimSchema(toolInputJsonSchema(tool)) as JsonSchema },
  }));
}

/** The activity text of a tool in a language (chips). */
export const activityOf = (tool: RegisteredAssistantTool, locale: Locale) => tool.activity[locale] ?? tool.activity.en;

/** The confirmation text: the tool's own description of what will happen, or its activity text. */
export async function describeCall(tool: RegisteredAssistantTool, ctx: AssistantToolContext, input: unknown): Promise<string> {
  try {
    if (tool.describe) return await tool.describe(ctx, input);
  } catch (error) {
    console.warn(`Assistant tool "${tool.name}": describe failed`, error);
  }
  return activityOf(tool, ctx.locale);
}

/**
 * The confirmation preview of a write, or null (no preview, or it failed: the card still shows the summary).
 * A preview that finds the change impossible throws an `HttpError` 4xx ("would overlap Keuken"): that error
 * is rethrown, so the loop tells the model instead of asking the person to confirm something that will fail.
 */
export async function previewCall(tool: RegisteredAssistantTool, ctx: AssistantToolContext, input: unknown): Promise<AssistantPreview | null> {
  if (!tool.preview) return null;
  try {
    return (await tool.preview(ctx, input)) ?? null;
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) throw error;
    console.warn(`Assistant tool "${tool.name}": preview failed`, error);
    return null;
  }
}
