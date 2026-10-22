import type { LoaderFunctionArgs } from "react-router";
import { assistantClient } from "./assistant-client";
import type { AssistantConversationDetail, AssistantConversationSummary, AssistantStatus } from "../types/assistant";

export type AssistantLoaderData = {
  status: AssistantStatus;
  /** Deferred: the list shows a skeleton until it arrives; `null` when it failed. */
  conversations: Promise<AssistantConversationSummary[] | null>;
  /** The open conversation (`/assistant/:conversationId`), or `null` for a new chat. */
  conversation: AssistantConversationDetail | null;
};

/** `/assistant` and `/assistant/:conversationId`. */
export async function assistantLoader({ params }: LoaderFunctionArgs): Promise<AssistantLoaderData> {
  const conversations = assistantClient.listConversations().catch((error: unknown) => {
    console.warn("Assistant: conversations could not load", error);
    return null;
  });
  const [status, conversation] = await Promise.all([
    assistantClient.status(),
    params.conversationId ? assistantClient.getConversation(params.conversationId) : Promise.resolve(null),
  ]);
  return { status, conversations, conversation };
}
