import * as React from "react";
import { MapPinIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AssistantMarkdown } from "./assistant-markdown";
import type { ChatImage } from "../data/chat-state";

type ChatMessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
  /** Questions: the attached images, above the text; each opens full size in a new tab. */
  images?: ChatImage[];
  /** Questions: the label of the page it was asked about (screen context), a small chip above. */
  screen?: string;
  /** The answer is still arriving: a blinking caret at the end. */
  streaming?: boolean;
  className?: string;
  onRecordNavigate?: () => void;
  onEdit?: (text: string) => void;
};

/** One question or answer in the chat. */
export function ChatMessageBubble({ role, text, images = [], screen, streaming = false, className, onRecordNavigate, onEdit }: ChatMessageBubbleProps) {
  const { t } = useTranslation("assistant");
  const mine = role === "user";
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(text);
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start", className)}>
      {screen && (
        <span className="inline-flex max-w-[85%] min-w-0 items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground sm:max-w-[75%]">
          <MapPinIcon className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">{t("chat.screenAbout")} </span>
          <span className="min-w-0 truncate">{screen}</span>
        </span>
      )}
      {images.length > 0 && (
        <ul className="flex max-w-[85%] flex-wrap justify-end gap-1.5 sm:max-w-[75%]" aria-label={t("chat.images")}>
          {images.map((image) => (
            <li key={image.id}>
              <a href={image.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border bg-muted">
                <img src={image.url} alt={t("chat.image")} loading="lazy" className="h-32 max-w-full object-contain sm:h-40" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {(text || streaming || !images.length) && (
      <div
        className={cn(
          "min-w-0 text-sm break-words",
          mine ? "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-muted px-4 py-2.5 sm:max-w-[80%]" : "w-full px-1 py-2",
        )}
      >
        <span className="sr-only">{mine ? t("chat.you") : t("chat.assistant")}: </span>
        {editing ? <form className="flex min-w-0 flex-col gap-2" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { onEdit?.(draft.trim()); setEditing(false); } }}><Textarea aria-label={t("chat.edit")} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} autoFocus /><div className="flex flex-wrap gap-2"><Button size="sm" type="submit">{t("chat.resend")}</Button><Button size="sm" type="button" variant="outline" onClick={() => setEditing(false)}>{t("confirm.cancel")}</Button></div></form> : mine ? text : text.length > 12000 && !streaming ? <details><summary className="cursor-pointer text-muted-foreground">{text.slice(0, 180)}…</summary><AssistantMarkdown text={text} onRecordNavigate={onRecordNavigate} /></details> : <AssistantMarkdown text={text} onRecordNavigate={onRecordNavigate} />}
        {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current align-text-bottom opacity-60" aria-hidden />}
      </div>
      )}
      {!streaming && !editing && text && <div className="flex gap-1 text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{t(copied ? "chat.copied" : "chat.copy")}</Button>
        {mine && onEdit && <Button variant="ghost" size="sm" onClick={() => { setDraft(text); setEditing(true); }}>{t("chat.edit")}</Button>}
      </div>}
    </div>
  );
}
