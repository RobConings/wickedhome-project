import * as React from "react";
import { ImagePlusIcon, LoaderCircleIcon, MapPinIcon, MapPinOffIcon, SendHorizontalIcon, SquareIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ImageAttachment } from "../hooks/use-image-attachments";
import { ASSISTANT_MESSAGE_MAX } from "../types/assistant";

/** The images of the question being written (`useImageAttachments`); absent: no attach button. */
export type ComposerImages = {
  items: ImageAttachment[];
  /** At least one is uploaded: Send works without text. */
  ready: boolean;
  /** Send waits until every upload finished. */
  uploading: boolean;
  /** The most a question can carry: the attach button is disabled. */
  full: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
};

/** The page the chat was opened from (screen context): a chip above the field, one tap leaves it out. */
export type ComposerScreen = {
  label: string;
  /** Sent with the next question. */
  on: boolean;
  onToggle: () => void;
};

type ChatComposerProps = {
  /** An answer is streaming: Send becomes Stop. */
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** The push-to-talk button (and anything else next to Send). */
  voice?: React.ReactNode;
  /** Attached images: picked with the button, pasted or dropped. */
  images?: ComposerImages;
  /** The page the question is about; absent: no chip. */
  screen?: ComposerScreen;
  /** A status line above the field: "Listening…", an interim transcript, a voice error. */
  hint?: React.ReactNode;
  autoFocus?: boolean;
  className?: string;
};

const imageFiles = (files: FileList | null | undefined) => [...(files ?? [])].filter((file) => file.type.startsWith("image/"));

/** The question field: Enter sends, Shift+Enter adds a line; Send turns into Stop while answering. */
export function ChatComposer({ busy, disabled = false, onSend, onStop, voice, images, screen, hint, autoFocus = false, className }: ChatComposerProps) {
  const { t } = useTranslation("assistant");
  const [text, setText] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);
  const canSend = (text.trim() !== "" || Boolean(images?.ready)) && !images?.uploading;
  const submit = () => {
    const value = text.trim();
    if (!canSend || busy || disabled) return;
    onSend(value);
    setText("");
  };
  return (
    <form
      className={cn("flex flex-col gap-1.5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragOver={(event) => {
        if (images && !images.full && event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const files = imageFiles(event.dataTransfer.files);
        if (!images || !files.length) return;
        event.preventDefault();
        images.onAdd(files);
      }}
    >
      {hint && <div className="px-1 text-xs text-muted-foreground" aria-live="polite">{hint}</div>}
      <div className="flex flex-col gap-1.5 rounded-2xl border bg-background p-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        {screen && (
          <div className="flex min-w-0 px-1 pt-1">
            <button
              type="button"
              onClick={screen.onToggle}
              aria-pressed={screen.on}
              aria-label={t(screen.on ? "chat.screenOn" : "chat.screenOff", { label: screen.label })}
              title={t(screen.on ? "chat.screenOn" : "chat.screenOff", { label: screen.label })}
              className={cn(
                "inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                screen.on ? "border-primary/30 bg-primary/10 text-foreground hover:bg-primary/15" : "border-dashed text-muted-foreground hover:bg-muted",
              )}
            >
              {screen.on ? <MapPinIcon className="size-3.5 shrink-0" aria-hidden /> : <MapPinOffIcon className="size-3.5 shrink-0" aria-hidden />}
              <span className={cn("min-w-0 truncate", !screen.on && "line-through")}>{screen.label}</span>
              {screen.on && <XIcon className="size-3 shrink-0 opacity-60" aria-hidden />}
            </button>
          </div>
        )}
        {images && images.items.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-1 pt-1" aria-label={t("chat.images")}>
            {images.items.map((image) => (
              <li key={image.key} className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                <img src={image.url} alt={t("chat.image")} className="size-full object-cover" />
                {image.status !== "ready" && (
                  <span
                    className="absolute inset-0 flex items-center justify-center bg-background/70"
                    title={image.status === "failed" ? t("chat.imageFailed") : t("chat.imageUploading")}
                  >
                    {image.status === "failed" ? (
                      <TriangleAlertIcon className="size-4 text-destructive" aria-label={t("chat.imageFailed")} />
                    ) : (
                      <LoaderCircleIcon className="size-4 animate-spin" aria-label={t("chat.imageUploading")} />
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => images.onRemove(image.key)}
                  aria-label={t("chat.removeImage")}
                  className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-xs hover:bg-background"
                >
                  <XIcon className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1.5">
          {images && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  const files = imageFiles(event.target.files);
                  event.target.value = "";
                  if (files.length) images.onAdd(files);
                }}
              />
              <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                disabled={disabled || images.full}
                onClick={() => fileInput.current?.click()}
                aria-label={t("chat.attach")}
                title={t("chat.attach")}
              >
                <ImagePlusIcon />
              </Button>
            </>
          )}
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            onPaste={(event) => {
              const files = imageFiles(event.clipboardData.files);
              if (!images || images.full || !files.length) return;
              event.preventDefault();
              images.onAdd(files);
            }}
            placeholder={t("chat.placeholder")}
            aria-label={t("chat.placeholder")}
            maxLength={ASSISTANT_MESSAGE_MAX}
            rows={1}
            disabled={disabled}
            autoFocus={autoFocus}
            enterKeyHint="send"
            className="max-h-40 min-h-10 min-w-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {voice}
          {busy ? (
            <Button type="button" size="icon-lg" variant="secondary" onClick={onStop} aria-label={t("chat.stop")}>
              <SquareIcon />
            </Button>
          ) : (
            <Button type="submit" size="icon-lg" disabled={disabled || !canSend} aria-label={t("chat.send")}>
              <SendHorizontalIcon />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
