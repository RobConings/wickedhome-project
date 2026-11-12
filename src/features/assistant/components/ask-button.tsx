import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import * as React from "react";
import { BotIcon, Maximize2Icon, Minimize2Icon, MessagesSquareIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InlineAlert } from "@/components/shared/inline-alert";
import { LoadingState } from "@/components/shared/loading-state";
import { cn } from "@/lib/utils";
import type { ScreenContext } from "@/types/screen-context";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import type { AssistantStatus } from "../types/assistant";
import { useChatViewport } from "../hooks/use-chat-viewport";
import { ConversationList } from "./conversation-list";
import { AssistantProviderSettings } from "./assistant-provider-settings";
import type { AssistantConversationSummary } from "../types/assistant";
import { AssistantChat } from "./assistant-chat";

type AskButtonProps = {
  client?: AssistantClient;
  className?: string;
  /** Controlled open state, so the frame can open the chat from elsewhere (the "Ask the assistant" quick action). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Show the round corner button (default). Without it only the sheet is there, opened through `open`. */
  showTrigger?: boolean;
  /** The page it is opened from (screen context): the chat offers it as the question's subject. */
  screen?: ScreenContext | null;
};

/**
 * The quick "Ask" button the app frame shows on every page: a small round button in the corner that opens
 * a chat sheet (a new conversation, saved under Assistant). Loads the assistant's status when opened. With
 * `screen`, questions can be about what the page shows (ai/docs/ASSISTANT.md, "Screen context").
 */
export function AskButton({ client = assistantClient, className, open: openProp, onOpenChange, showTrigger = true, screen = null }: AskButtonProps) {
  const { t } = useTranslation("assistant");
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  const [expanded, setExpanded] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [conversations, setConversations] = React.useState<AssistantConversationSummary[]>([]);
  const viewportRef = useChatViewport(open);
  const [status, setStatus] = React.useState<AssistantStatus | null | "failed">(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  // A new chat each time the sheet opens after an answer was given (from the button or from outside).
  const [session, setSession] = React.useState(0);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && conversationId) {
      setConversationId(null);
      setSession((value) => value + 1);
    }
  }

  React.useEffect(() => {
    if (!open || (status && status !== "failed")) return;
    let cancelled = false;
    client
      .status()
      .then((value) => !cancelled && setStatus(value))
      .catch(() => !cancelled && setStatus("failed"));

    return () => {
      cancelled = true;
    };
  }, [client, open, status]);

  React.useEffect(() => {
    if (!open || !expanded) return;
    let active = true;
    void client.listConversations().then((rows) => { if (active) setConversations(rows); }).catch(() => undefined);
    return () => { active = false; };
  }, [client, open, expanded, conversationId]);

  return (
    <>
      {showTrigger && (
        <Button
          type="button"
          size="icon-lg"
          aria-label={t("ask.button")}
          title={t("ask.button")}
          onClick={() => setOpen(true)}
          className={cn(
            "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--mobile-nav-height,0px))] z-40 size-11 rounded-full shadow-lg print:hidden",
            className,
          )}
        >
          <BotIcon className="size-5" />
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent ref={viewportRef} side="right" className={cn("top-[var(--chat-viewport-top,0px)] flex h-[var(--chat-viewport-height,100dvh)] w-full flex-col gap-0 p-0 pt-[env(safe-area-inset-top)]", expanded ? "sm:max-w-none" : "sm:max-w-md")}>
          <SheetHeader className="flex-row items-center gap-2 border-b px-3 py-2 pr-12">
            {expanded && <Button variant="ghost" size="icon" aria-label={t("conversations.open")} aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}><MessagesSquareIcon /></Button>}
            <div className="min-w-0 flex-1"><SheetTitle className="truncate">{t("ask.title")}</SheetTitle><SheetDescription className="sr-only">{t("ask.description")}</SheetDescription></div>
            <Button variant="ghost" size="icon" aria-label={t(expanded ? "chat.collapse" : "chat.openFull")} onClick={() => { const next = !expanded; setExpanded(next); setHistoryOpen(next && window.matchMedia("(min-width: 1024px)").matches); }}>{expanded ? <Minimize2Icon /> : <Maximize2Icon />}</Button>
          </SheetHeader>
          <Inline gap="none" align="stretch" className="min-h-0 flex-1">
          {expanded && <aside className={cn("min-h-0 w-72 shrink-0 flex-col border-r p-3", historyOpen ? "flex w-full sm:w-72" : "hidden")}>
            <ConversationList search={client.listConversations} conversations={conversations} activeId={conversationId} onNavigate={() => setOpen(false)} onRename={async (id, title) => { await client.renameConversation(id, title); setConversations(await client.listConversations()); }} onDelete={async (id) => { await client.deleteConversation(id); setConversations(await client.listConversations()); }} className="flex-1" />
          </aside>}
          <div className={cn("mx-auto flex min-h-0 min-w-0 flex-1 flex-col px-3", expanded && "max-w-4xl", expanded && historyOpen && "hidden sm:flex")}>
            {status && status !== "failed" && <div className="py-2"><AssistantProviderSettings compact /></div>}
            {status === null ? (
              <LoadingState label={t("page.loading")} className="flex-1" />
            ) : status === "failed" ? (
              <InlineAlert tone="error" className="mt-3">
                {t("errors.generic")}
              </InlineAlert>
            ) : !status.configured ? (
              <Stack gap="3" className="py-4">
                <InlineAlert tone="info">{t("ask.notConfigured")}</InlineAlert>
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link to="/settings?section=assistant">{t("ask.setup")}</Link>
                </Button>
              </Stack>
            ) : (
              <AssistantChat
                key={session}
                conversationId={null}
                serverStt={status.stt}
                vision={status.vision ?? false}
                screen={screen}
                serverTts={Boolean(status.tts?.configured && status.tts.ok)}
                client={client}
                onConversationCreated={setConversationId}
                onRecordNavigate={() => setOpen(false)}
                autoFocus
              />
            )}
          </div>
          </Inline>
        </SheetContent>
      </Sheet>
    </>
  );
}
