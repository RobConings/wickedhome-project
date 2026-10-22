import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { IntegrationSetupStep } from "../types/integrations";

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation("integrations");
  const [copied, setCopied] = React.useState(false);
  // The clipboard needs https; on the plain-http LAN address the text can still be selected by hand.
  if (typeof navigator === "undefined" || !navigator.clipboard) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("setup.copy")}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

/**
 * "Not configured": what the owner does on the server, as numbered steps with copyable `.env` names and
 * commands. Never shows values: secrets are typed into `.env` on the server, not into the app.
 */
export function IntegrationSetupSteps({ intro, steps, outro }: { intro?: string; steps: IntegrationSetupStep[]; outro?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3 text-sm sm:p-4">
      {intro && <p className="text-muted-foreground">{intro}</p>}
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        {steps.map((step, index) => (
          <li key={index} className="pl-1">
            {step.kind === "text" ? (
              <span>{step.text}</span>
            ) : (
              <span className="flex flex-col gap-1">
                <span className="flex min-w-0 items-center gap-1">
                  <code className="min-w-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all select-all">
                    {step.kind === "env" ? `${step.name}=…` : step.command}
                  </code>
                  <CopyButton text={step.kind === "env" ? `${step.name}=` : step.command} />
                </span>
                {step.hint && <span className="text-muted-foreground">{step.hint}</span>}
              </span>
            )}
          </li>
        ))}
      </ol>
      {outro && <p className="text-muted-foreground">{outro}</p>}
    </div>
  );
}
