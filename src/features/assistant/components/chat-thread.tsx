import * as React from "react";
import { BotIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/shared/inline-alert";
import { cn } from "@/lib/utils";
import type { ChatItem } from "../data/chat-state";
import type { ConfirmExtra } from "../hooks/use-assistant-chat";
import { ChatMessageBubble } from "./chat-message-bubble";
import { ConfirmationCard } from "./confirmation-card";
import { StructuredResponse } from "./structured-response";
import { ToolActivityChip } from "./tool-activity-chip";

type ChatThreadProps = {
  onRecordNavigate?: () => void;
  items: ChatItem[];
  /** An answer is on its way: shows "Thinking…" until text arrives. */
  busy: boolean;
  onDecide: (messageId: string, decision: "confirm" | "cancel", remember: boolean, extra?: ConfirmExtra) => void;
  /** Ask the last question again: a "Try again" button on an error that ends the thread. */
  onRetry?: () => void;
  onEdit?: (item: Extract<ChatItem, { kind: "user" }>, text: string) => void;
  /** Shown when there are no messages yet: tap one to ask it. */
  suggestions?: string[];
  onSuggestion?: (text: string) => void;
  className?: string;
};

const SUGGESTION_KEYS = ["today", "tasks", "pay", "bins", "shopping"] as const;

/** The messages, tool chips, confirmation cards, notices and errors of one conversation, newest at the bottom. */
export function ChatThread({ items, busy, onDecide, onRetry, suggestions, onSuggestion, className, onRecordNavigate, onEdit }: ChatThreadProps) {
  const { t } = useTranslation("assistant");
  const end = React.useRef<HTMLDivElement>(null);
  const last = items[items.length - 1];
  const thinking = busy && !(last?.kind === "assistant" && last.streaming) && last?.kind !== "confirm";

  const follow = React.useRef(true);
  React.useEffect(() => {
    const container = end.current?.closest("[data-chat-scroll]");
    if (!(container instanceof HTMLElement)) return;
    const onScroll = () => { follow.current = container.scrollHeight - container.scrollTop - container.clientHeight < 100; };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);
  React.useEffect(() => {
    const container = end.current?.closest("[data-chat-scroll]");
    if (follow.current && container instanceof HTMLElement) container.scrollTop = container.scrollHeight;
  }, [items, thinking]);

  const errorText = (code: string, message: string) => t(`errors.${code}`, { message, defaultValue: message || t("errors.generic") });

  if (!items.length && !busy) {
    const list = suggestions ?? SUGGESTION_KEYS.map((key) => t(`chat.suggestions.${key}`));
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center gap-4 px-2 py-8 text-center", className)}>
        <BotIcon className="size-10 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("chat.emptyTitle")}</h2>
          <p className="max-w-sm text-sm text-muted-foreground text-pretty">{t("chat.emptyDescription")}</p>
        </div>
        {onSuggestion && (
          <div className="flex max-w-md flex-wrap justify-center gap-2">
            {list.map((text) => (
              <Button key={text} type="button" variant="outline" size="sm" className="h-auto min-h-10 whitespace-normal" onClick={() => onSuggestion(text)}>
                {text}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div role="log" aria-live="polite" aria-label={t("chat.label")} className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => {
        switch (item.kind) {
          case "structured":
            return <StructuredResponse key={item.key} response={item.response} onSend={onSuggestion} disabled={busy} onNavigate={onRecordNavigate} />;
          case "user":
          case "assistant":
            return (
              <ChatMessageBubble
                key={item.key}
                role={item.kind}
                text={item.text}
                images={item.kind === "user" ? item.images : undefined}
                screen={item.kind === "user" ? item.screen?.label : undefined}
                streaming={item.kind === "assistant" && item.streaming}
                onRecordNavigate={onRecordNavigate}
                onEdit={item.kind === "user" && !busy && onEdit ? (text) => onEdit(item, text) : undefined}
              />
            );
          case "tool":
            return <ToolActivityChip key={item.key} label={item.label} status={item.status} error={item.error} />;
          case "confirm":
            return (
              <ConfirmationCard
                key={item.key}
                summary={item.summary}
                preview={item.preview}
                options={item.options}
                permission={item.permission}
                allowRemember={item.allowRemember}
                submitting={item.submitting}
                disabled={busy && item.submitting === null}
                onDecide={(decision, remember, extra) => onDecide(item.messageId, decision, remember, extra)}
                className={item.preview ? "max-w-xl" : "max-w-md"}
              />
            );
          case "status":
            // Shown in the "Thinking…" line below instead.
            return null;
          case "notice":
            return (
              <InlineAlert key={item.key} tone="info">
                {t(`notice.${item.code}`)}
              </InlineAlert>
            );
          case "error":
            return (
              <InlineAlert key={item.key} tone="error">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span>{errorText(item.code, item.message)}</span>
                  {(item.code.startsWith("subscription_sharing") || item.code.startsWith("chatpass_") || item.code === "invalid_client" || item.code.startsWith("chatgpt_") || item.code === "reconnect_required" || item.code === "plan_permission_required") && <Button asChild size="sm" variant={item.code === "subscription_sharing_usage_limit_exceeded" ? "default" : "outline"}><a href={item.code === "subscription_sharing_usage_limit_exceeded" ? "https://chatgpt.com/settings/usage" : "/settings?section=assistant"}>{t(item.code === "subscription_sharing_usage_limit_exceeded" ? "provider.usage" : "provider.title")}</a></Button>}
                  {onRetry && !busy && item === last && item.code !== "aborted" && !["subscription_sharing_usage_limit_exceeded", "subscription_sharing_user_not_eligible", "subscription_sharing_unsupported_capability", "subscription_sharing_route_not_supported", "chatpass_v2_scope_not_authorized", "chatpass_v2_invalid_authorization_context", "invalid_client"].includes(item.code) && (
                    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                      {t("chat.retry")}
                    </Button>
                  )}
                </span>
              </InlineAlert>
            );
        }
      })}
      {thinking && (
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <span className="flex gap-1" aria-hidden>
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current" />
          </span>
          {last?.kind === "status" ? t(`chat.status.${last.code}`) : t("chat.thinking")}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
