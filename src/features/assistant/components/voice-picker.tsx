import * as React from "react";
import { PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineAlert } from "@/components/shared/inline-alert";
import { SkeletonBlock } from "@/components/shared/loading-state";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import { playAudio, unlockAudio } from "../data/speech-audio";
import { readVoicePreference, writeVoicePreference } from "../data/voice-preferences";
import { useVoiceLabel } from "../hooks/use-voice-label";
import type { AssistantTtsStatus, AssistantVoice } from "../types/assistant";

type VoicePickerProps = {
  client?: Pick<AssistantClient, "voices" | "speech">;
  className?: string;
};

const LANGUAGES = ["nl", "en"] as const;
type Language = (typeof LANGUAGES)[number];
const DEFAULT = "__default__";

/**
 * The server voice per language for this device (Assistant settings), with a Test button that plays a short
 * sample. Loads the voices from the speech server; remembered in this browser only.
 */
export function VoicePicker({ client = assistantClient, className }: VoicePickerProps) {
  const { t } = useTranslation("assistant");
  const [status, setStatus] = React.useState<AssistantTtsStatus | null | "failed">(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    client
      .voices()
      .then((value) => !cancelled && setStatus(value))
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
    };
  }, [client, attempt]);

  const retry = () => {
    setStatus(null);
    setAttempt((value) => value + 1);
  };

  return (
    <section className={className} aria-labelledby="assistant-voice-title">
      <h3 id="assistant-voice-title" className="text-sm font-medium">
        {t("voices.title")}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("voices.description")}</p>
      <div className="mt-3 flex flex-col gap-4">
        {status === null ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("voices.loading")}>
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
          </div>
        ) : status === "failed" ? (
          <InlineAlert tone="error">
            {t("voices.loadFailed")}{" "}
            <Button variant="link" size="sm" className="h-auto p-0" onClick={retry}>
              <RotateCwIcon />
              {t("voices.retry")}
            </Button>
          </InlineAlert>
        ) : (
          <>
            {status.ok === false && <InlineAlert tone="warning">{t("voices.unreachable")}</InlineAlert>}
            {LANGUAGES.map((language) => (
              <LanguageVoice key={language} language={language} status={status} client={client} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function LanguageVoice({ language, status, client }: { language: Language; status: AssistantTtsStatus; client: Pick<AssistantClient, "speech"> }) {
  const { t } = useTranslation("assistant");
  const label = useVoiceLabel();
  const voices = status.voices.filter((voice: AssistantVoice) => voice.locale === language || voice.locale === null);
  const [choice, setChoice] = React.useState(() => {
    const saved = readVoicePreference(language);
    return saved && voices.some((voice) => voice.id === saved) ? saved : DEFAULT;
  });
  const [test, setTest] = React.useState<"idle" | "loading" | "playing" | "failed">("idle");
  const audio = React.useRef<HTMLAudioElement | null>(null);
  const controller = React.useRef<AbortController | null>(null);
  const id = `assistant-voice-${language}`;

  React.useEffect(() => () => controller.current?.abort(), []);

  const change = (value: string) => {
    setChoice(value);
    writeVoicePreference(language, value === DEFAULT ? null : value);
    controller.current?.abort();
    setTest("idle");
  };

  const play = async () => {
    if (test === "playing") {
      controller.current?.abort();
      setTest("idle");
      return;
    }
    // Inside the tap, before waiting for the server: phones only play sound a tap started.
    audio.current ??= new Audio();
    unlockAudio(audio.current);
    const abort = new AbortController();
    controller.current = abort;
    setTest("loading");
    let url: string | null = null;
    try {
      const blob = await client.speech({ text: t(`voices.sample.${language}`), locale: language, ...(choice !== DEFAULT ? { voice: choice } : {}) }, abort.signal);
      if (abort.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setTest("playing");
      await playAudio(audio.current, url, abort.signal);
      if (!abort.signal.aborted) setTest("idle");
    } catch {
      if (!abort.signal.aborted) setTest("failed");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t(`voices.language.${language}`)}</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={choice} onValueChange={change}>
          <SelectTrigger id={id} className="w-full min-w-0 sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>{t("voices.default", { voice: label(status.defaults[language]) })}</SelectItem>
            {voices.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {label(voice.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          fullOnMobile
          loading={test === "loading"}
          onClick={() => void play()}
          aria-label={test === "playing" ? t("voices.stop") : t("voices.testLabel", { language: t(`voices.language.${language}`) })}
        >
          {test === "playing" ? <SquareIcon /> : <PlayIcon />}
          {test === "loading" ? t("voices.testing") : test === "playing" ? t("voices.stop") : t("voices.test")}
        </Button>
      </div>
      {test === "failed" && <p className="text-xs font-medium text-destructive">{t("voices.testFailed")}</p>}
      {voices.length === 0 && status.ok && <p className="text-xs text-muted-foreground">{t("voices.none")}</p>}
    </div>
  );
}
