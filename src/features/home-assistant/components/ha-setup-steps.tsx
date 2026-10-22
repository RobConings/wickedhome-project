import { Trans, useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const STEPS = ["install", "integrations", "energy", "token", "env", "restart"] as const;

/** What the owner does to connect Home Assistant (shown while it isn't configured). Never shows a token. */
export function HaSetupSteps({ className }: { className?: string }) {
  const { t } = useTranslation("home-assistant");
  return (
    <ol className={cn("flex list-decimal flex-col gap-2 pl-5 text-sm marker:text-muted-foreground", className)}>
      {STEPS.map((step) => (
        <li key={step} className="pl-1">
          <Trans
            t={t}
            i18nKey={`setup.steps.${step}`}
            components={{ code: <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all" />, strong: <strong /> }}
          />
        </li>
      ))}
    </ol>
  );
}
