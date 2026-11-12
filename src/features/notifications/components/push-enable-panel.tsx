import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
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
    <Stack gap="3">
      {support === "ios-install" && (
        <InlineAlert>
          <ShareIcon />
          <Stack gap="xs">
            <Text weight="medium">{t("push.iosTitle")}</Text>
            <Text tone="muted">{t("push.iosSteps")}</Text>
          </Stack>
        </InlineAlert>
      )}
      {support === "denied" && (
        <InlineAlert tone="error">
          <BellRingIcon />
          <Text>{t("push.denied")}</Text>
        </InlineAlert>
      )}
      {support === "insecure" && (
        <InlineAlert>
          <BellRingIcon />
          <Text>{t("push.insecure")}</Text>
        </InlineAlert>
      )}
      {support === "unsupported" && (
        <InlineAlert>
          <BellRingIcon />
          <Text>{t("push.unsupported")}</Text>
        </InlineAlert>
      )}
      {support === "available" &&
        (enabled ? (
          <InlineAlert tone="success">
            <CheckCircle2Icon />
            <Text>{t("push.on")}</Text>
          </InlineAlert>
        ) : (
          <Stack gap="sm" className="rounded-lg border p-3 sm:flex-row sm:items-center">
            <SmartphoneIcon className="hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
            <Text size="sm" className="flex-1">{dismissed ? t("push.permissionDismissed") : t("push.off")}</Text>
            <Button size="lg" onClick={onEnable} loading={enabling}>
              <BellRingIcon />
              {enabling ? t("push.enabling") : t("push.enable")}
            </Button>
          </Stack>
        ))}
      <Stack gap="sm" className="sm:flex-row sm:items-center sm:justify-between">
        <Text size="sm" tone="muted">{t("push.androidHint")}</Text>
        <Button variant="outline" size="lg" onClick={onTest} loading={testing}>
          <SendIcon />
          {t("push.test")}
        </Button>
      </Stack>
    </Stack>
  );
}
