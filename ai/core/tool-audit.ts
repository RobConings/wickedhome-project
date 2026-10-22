import { audit } from "@/api/audit/audit.service";
import { describeCall, setAssistantToolAuditor, type AssistantToolContext, type RegisteredAssistantTool } from "./tools";

/**
 * Every write the assistant (chat, voice) or an MCP client makes goes to the household audit log, recorded by
 * the tool runner (`runTool` → `auditToolCall`). The action is the tool's name (`tasks.complete`), the summary
 * the same text the confirmation card shows ("Mark "Bins out" done"). Imported by assistant.routes.ts and
 * mcp.routes.ts.
 */
export async function recordToolCall(tool: RegisteredAssistantTool, ctx: AssistantToolContext, input: unknown): Promise<void> {
  await audit(
    {
      householdId: ctx.householdId,
      userId: ctx.user.id,
      name: ctx.via ? `${ctx.user.name} · ${ctx.via}` : ctx.user.name,
      channel: ctx.channel === "mcp" ? "mcp" : "assistant",
    },
    { action: tool.name, targetType: tool.name.split(".")[0] ?? null, summary: await describeCall(tool, ctx, input) },
  );
}

setAssistantToolAuditor(recordToolCall);
