import * as React from "react";
import { MapPinIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
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
};

/** `**bold**` as <strong>; everything else stays plain text (models write a little Markdown). */
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
  );
}

/** One question or answer in the chat. */
export function ChatMessageBubble({ role, text, images = [], screen, streaming = false, className }: ChatMessageBubbleProps) {
  const { t } = useTranslation("assistant");
  const mine = role === "user";
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
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words sm:max-w-[75%]",
          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
        )}
      >
        <span className="sr-only">{mine ? t("chat.you") : t("chat.assistant")}: </span>
        {renderInline(text)}
        {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current align-text-bottom opacity-60" aria-hidden />}
      </div>
      )}
    </div>
  );
}
