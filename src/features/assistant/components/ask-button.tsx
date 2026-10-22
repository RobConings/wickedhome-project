import * as React from "react";
import { BotIcon, ExternalLinkIcon } from "lucide-react";
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
            "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 size-11 rounded-full shadow-lg print:hidden",
            className,
          )}
        >
          <BotIcon className="size-5" />
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 pt-[env(safe-area-inset-top)] sm:max-w-md">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{t("ask.title")}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-2">
              {t("ask.description")}
              {conversationId && (
                <Link to={`/assistant/${conversationId}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                  {t("chat.openFull")}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </Link>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-3">
            {status === null ? (
              <LoadingState label={t("page.loading")} className="flex-1" />
            ) : status === "failed" ? (
              <InlineAlert tone="error" className="mt-3">
                {t("errors.generic")}
              </InlineAlert>
            ) : !status.configured ? (
              <div className="flex flex-col gap-3 py-4">
                <InlineAlert tone="info">{t("ask.notConfigured")}</InlineAlert>
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link to="/integrations">{t("ask.setup")}</Link>
                </Button>
              </div>
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
                autoFocus
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
