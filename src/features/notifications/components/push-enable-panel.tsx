import { BellRingIcon, CheckCircle2Icon, SendIcon, ShareIcon, SmartphoneIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { PushSupport } from "../data/push-support";

type PushEnablePanelProps = {
  support: PushSupport;
  /** This browser already has a subscription the server knows. */
  enabled: boolean;
  enabling: boolean;
  testing: boolean;
  /** Asks for permission: must stay on a click. */
  onEnable: () => void;
  onTest: () => void;
  /** The person closed the permission prompt without choosing. */
  dismissed?: boolean;
};

/**
 * "This device": turn on push here (the permission prompt only comes from this button), or why it can't be
 * turned on: iPhone needs the home screen app, blocked permission, plain-HTTP address, unsupported browser.
 */
export function PushEnablePanel({ support, enabled, enabling, testing, onEnable, onTest, dismissed = false }: PushEnablePanelProps) {
  const { t } = useTranslation("notifications");

  return (
    <div className="flex flex-col gap-3">
      {support === "ios-install" && (
        <InlineAlert>
          <ShareIcon />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{t("push.iosTitle")}</p>
            <p className="text-muted-foreground">{t("push.iosSteps")}</p>
          </div>
        </InlineAlert>
      )}
      {support === "denied" && (
        <InlineAlert tone="error">
          <BellRingIcon />
          <p>{t("push.denied")}</p>
        </InlineAlert>
      )}
      {support === "insecure" && (
        <InlineAlert>
          <BellRingIcon />
          <p>{t("push.insecure")}</p>
        </InlineAlert>
      )}
      {support === "unsupported" && (
        <InlineAlert>
          <BellRingIcon />
          <p>{t("push.unsupported")}</p>
        </InlineAlert>
      )}
      {support === "available" &&
        (enabled ? (
          <InlineAlert tone="success">
            <CheckCircle2Icon />
            <p>{t("push.on")}</p>
          </InlineAlert>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
            <SmartphoneIcon className="hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
            <p className="flex-1 text-sm">{dismissed ? t("push.permissionDismissed") : t("push.off")}</p>
            <Button size="lg" onClick={onEnable} loading={enabling}>
              <BellRingIcon />
              {enabling ? t("push.enabling") : t("push.enable")}
            </Button>
          </div>
        ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("push.androidHint")}</p>
        <Button variant="outline" size="lg" onClick={onTest} loading={testing}>
          <SendIcon />
          {t("push.test")}
        </Button>
      </div>
    </div>
  );
}
