import * as React from "react";
import { Volume2Icon, VolumeXIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ScreenContext } from "@/types/screen-context";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import { useAssistantChat } from "../hooks/use-assistant-chat";
import { useImageAttachments } from "../hooks/use-image-attachments";
import { useSpeechOutput } from "../hooks/use-speech-output";
import { useVoiceInput } from "../hooks/use-voice-input";
import type { AssistantMessage } from "../types/assistant";
import { ChatComposer } from "./chat-composer";
import { ChatThread } from "./chat-thread";
import { VoiceButton } from "./voice-button";

type AssistantChatProps = {
  conversationId: string | null;
  initialMessages?: AssistantMessage[];
  /** The conversation is still answering (left mid-answer): the chat attaches and shows the rest. */
  running?: boolean;
  /** Server speech-to-text is set up (else the browser's recognition, where it exists). */
  serverStt?: boolean;
  /** Server text-to-speech is set up and answering: answers are read in its voice (else the browser's). */
  serverTts?: boolean;
  /** Questions may carry images (the model reads them): the composer offers an attach button. */
  vision?: boolean;
  /**
   * The page the chat was opened from (screen context, `useScreenContext`): a chip above the field, on by
   * default; one tap leaves it out, and that choice stays for this chat until the page changes.
   */
  screen?: ScreenContext | null;
  onConversationCreated?: (id: string) => void;
  onSettled?: () => void;
  client?: AssistantClient;
  autoFocus?: boolean;
  className?: string;
};

/**
 * A working chat: the thread, the question field with push-to-talk, and the read-aloud switch. Used by the
 * Assistant page and the quick "Ask" sheet.
 */
export function AssistantChat({
  conversationId,
  initialMessages,
  running = false,
  serverStt = false,
  serverTts = false,
  vision = false,
  screen = null,
  onConversationCreated,
  onSettled,
  client = assistantClient,
  autoFocus = false,
  className,
}: AssistantChatProps) {
  const { t } = useTranslation("assistant");
  const locale = currentLocale();
  const speech = useSpeechOutput(locale, { client, server: serverTts });
  const chat = useAssistantChat({ client, conversationId, initialMessages, running, onConversationCreated, onSettled, speakAnswer: speech.begin });
  const attachments = useImageAttachments(client);
  // On by default for each new page; the person's choice stays while the page stays.
  const screenKey = screen ? `${screen.kind}:${screen.id ?? ""}` : null;
  const [screenOn, setScreenOn] = React.useState(true);
  const [screenFor, setScreenFor] = React.useState(screenKey);
  if (screenKey !== screenFor) {
    setScreenFor(screenKey);
    setScreenOn(true);
  }
  const askedAbout = screen && screenOn ? screen : null;
  const voice = useVoiceInput({ client, serverStt, locale, onResult: (text) => chat.send(text, { voice: true, screen: askedAbout }) });

  const hint =
    voice.state === "listening"
      ? voice.interim || t("voice.listening")
      : voice.state === "transcribing"
        ? t("voice.transcribing")
        : voice.state === "error" && voice.error
          ? t(`voice.${voice.error}`)
          : null;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-3">
        <ChatThread
          items={chat.items}
          busy={chat.busy}
          onDecide={chat.decide}
          onRetry={() => {
            speech.unlock();
            chat.retry();
          }}
          onSuggestion={(text) => {
            speech.unlock();
            chat.send(text);
          }}
          className="min-h-full"
        />
      </div>
      <div className="flex flex-col gap-1 border-t bg-background pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <ChatComposer
          busy={chat.busy}
          onSend={(text) => {
            speech.unlock();
            chat.send(text, { images: attachments.take(), screen: askedAbout });
          }}
          screen={screen ? { label: screen.label, on: screenOn, onToggle: () => setScreenOn((on) => !on) } : undefined}
          images={
            vision
              ? {
                  items: attachments.attachments,
                  ready: attachments.ready,
                  uploading: attachments.uploading,
                  full: attachments.full,
                  onAdd: (files) => void attachments.add(files),
                  onRemove: attachments.remove,
                }
              : undefined
          }
          onStop={chat.stop}
          hint={hint}
          autoFocus={autoFocus}
          voice={
            <VoiceButton
              state={voice.state}
              supported={voice.supported}
              disabled={chat.busy}
              onStart={() => {
                speech.cancel();
                // Inside the tap: lets the phone play the spoken answer when it arrives later.
                speech.unlock();
                void voice.start();
              }}
              onStop={voice.stop}
            />
          }
        />
        {speech.supported && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={speech.enabled}
              onClick={() => (speech.speaking ? speech.cancel() : speech.setEnabled(!speech.enabled))}
              className="text-muted-foreground"
            >
              {speech.enabled ? <Volume2Icon /> : <VolumeXIcon />}
              {speech.speaking ? t("voice.stopSpeaking") : t("voice.readAloud")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
