import * as React from "react";
import { MicIcon, MicOffIcon, SquareIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VoiceState } from "../hooks/use-voice-input";

type VoiceButtonProps = {
  state: VoiceState;
  supported: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  className?: string;
};

/** Held at least this long: releasing sends. Shorter: a tap, which toggles (tap again to send). */
const HOLD_MS = 400;

/**
 * Push-to-talk: hold to talk and release to send. A short tap toggles instead (tap again to send), and
 * Space/Enter toggle on a keyboard, so it also works without holding.
 */
export function VoiceButton({ state, supported, disabled = false, onStart, onStop, className }: VoiceButtonProps) {
  const { t } = useTranslation("assistant");
  const press = React.useRef<{ at: number; started: boolean } | null>(null);
  const listening = state === "listening";
  const transcribing = state === "transcribing";

  if (!supported) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer events; the span carries the tooltip. */}
          <span tabIndex={0} className={cn("inline-flex", className)}>
            <Button type="button" variant="ghost" size="icon-lg" disabled aria-label={t("voice.unsupported")}>
              <MicOffIcon />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("voice.unsupported")}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      variant={listening ? "destructive" : "ghost"}
      size="icon-lg"
      disabled={disabled || transcribing}
      aria-pressed={listening}
      aria-label={listening ? t("voice.stop") : transcribing ? t("voice.transcribing") : t("voice.start")}
      title={listening ? t("voice.listening") : t("voice.start")}
      className={cn("touch-none select-none", listening && "animate-pulse", className)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (listening) {
          press.current = { at: Date.now(), started: false };
          onStop();
        } else {
          press.current = { at: Date.now(), started: true };
          onStart();
        }
      }}
      onPointerUp={() => {
        const current = press.current;
        press.current = null;
        if (current?.started && Date.now() - current.at >= HOLD_MS) onStop();
      }}
      onPointerCancel={() => {
        if (press.current?.started) onStop();
        press.current = null;
      }}
      onClick={(event) => {
        // Keyboard activation only (pointer presses are handled above).
        if (event.detail !== 0) return;
        if (listening) onStop();
        else onStart();
      }}
    >
      {transcribing ? <Spinner /> : listening ? <SquareIcon /> : <MicIcon />}
    </Button>
  );
}
