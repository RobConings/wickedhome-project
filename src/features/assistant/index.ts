// Public API of the assistant feature (ai/README.md). Routes, the app frame and other features import
// from here only. The server side (tool registry, skills, LLM client, MCP) lives in ai/core and the skills in
// ai/skills; this folder is only the browser UI.
export { AskButton } from "./components/ask-button";
export { AssistantChat } from "./components/assistant-chat";
export { AssistantIntegrationCard } from "./components/assistant-integration-card";
export { AssistantSkillsList } from "./components/assistant-skills-list";
export { McpTokensPanel } from "./components/mcp-tokens-panel";
// OAuth for the MCP server (ai/docs/MCP-OAUTH.md): the connections panel on the card, the consent page
// (/connect/:requestId) and the action of the page that shows the card (manual OAuth apps, allowed hosts).
export { McpConnectionsPanel } from "./components/mcp-connections-panel";
export { McpConsentScreen } from "./screens/mcp-consent-screen";
export { mcpConsentLoader, mcpOAuthAction } from "./data/mcp-oauth-loaders";
export { AssistantScreen } from "./screens/assistant-screen";
export { assistantClient, type AssistantClient } from "./data/assistant-client";
export { assistantLoader, type AssistantLoaderData } from "./data/assistant-loaders";
export {
  registerAssistantPreviewRenderer,
  type AssistantPreviewEdit,
  type AssistantPreviewRenderer,
  type AssistantPreviewRendererProps,
} from "./components/previews/preview-registry";
export type {
  AssistantStatus,
  AssistantConversationSummary,
  AssistantConversationDetail,
  AssistantPreviewPayload,
  AssistantPreviewListItem,
  AssistantSkillInfo,
} from "./types/assistant";
