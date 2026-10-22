import { useLoaderData } from "react-router";
import { McpConsentScreen, mcpConsentLoader } from "@/features/assistant";

// `/connect/:requestId`: the OAuth consent page of the MCP server (ai/docs/MCP-OAUTH.md). Outside the session
// layout (no app frame), but signed in: the loader sends a visitor through /login and back.
export const loader = mcpConsentLoader;

export function Component() {
  return <McpConsentScreen data={useLoaderData<typeof mcpConsentLoader>()} />;
}
