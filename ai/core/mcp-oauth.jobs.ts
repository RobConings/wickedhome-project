import { registerJob } from "@/api/jobs/job-registry";
import { mcpOAuth } from "./mcp-oauth.store";

/**
 * OAuth housekeeping (ai/docs/MCP-OAUTH.md), every 10 minutes: expired consent requests, codes and tokens,
 * revoked grants, and dynamically registered clients not used for an hour that have no live grant (a
 * registration that never led to a connection, or whose connection was revoked).
 */
registerJob({
  id: "assistant.oauth-cleanup",
  schedule: "*/10 * * * *",
  titleKey: "assistant:jobs.oauthCleanup.title",
  descriptionKey: "assistant:jobs.oauthCleanup.description",
  recordIdleRuns: false,
  run: async () => {
    const { clients, grants, tokens } = await mcpOAuth.cleanup();
    if (clients + grants + tokens === 0) return { idle: true };
    return { summary: `${clients} unused clients, ${grants} old connections and ${tokens} expired tokens removed` };
  },
});
