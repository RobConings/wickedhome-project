import { useLoaderData } from "react-router";
import { AssistantScreen, assistantLoader, mcpOAuthAction } from "@/features/assistant";

export const loader = assistantLoader;
/** The settings sheet shows the Assistant card: its OAuth forms (manual apps, allowed hosts) post here. */
export const action = mcpOAuthAction;

export function Component() {
  return <AssistantScreen data={useLoaderData<typeof assistantLoader>()} />;
}
