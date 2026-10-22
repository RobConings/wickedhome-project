import * as React from "react";
import { BellPlusIcon, BellRingIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { notificationsClient, type NotificationsClient } from "../data/notifications-requests";

type NotifyMeToggleProps = {
  /** A scoped kind, e.g. `devices.indicator`. */
  kind: string;
  /** What to follow: `device:<id>`, `profile:<id>`. */
  scopeId: string;
  /** Shown in the confirmation toast ("Window bedroom"). */
  name: string;
  /** API access; stories pass a fake. */
  client?: NotificationsClient;
};

/**
 * "Notify me" on another feature's page (a device): adds or removes it from the person's scoped kind. Loads
 * its own state; the button flips at once and rolls back with a toast when saving fails.
 */
export function NotifyMeToggle({ kind, scopeId, name, client = notificationsClient }: NotifyMeToggleProps) {
  const { t } = useTranslation("notifications");
  const [on, setOn] = React.useState<boolean | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    client
      .settings()
      .then((settings) => {
        const stored = settings.preferences.kinds[kind];
        if (!cancelled) setOn(Boolean(stored?.enabled !== false && stored?.scope?.includes(scopeId)));
      })
      .catch(() => {
        if (!cancelled) setOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, kind, scopeId]);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    try {
      await client.setScope({ kind, scopeId, on: next });
      toast.success(t(next ? "notifyMe.on" : "notifyMe.off", { name }));
    } catch {
      setOn(!next);
      toast.error(t("notifyMe.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      variant={on ? "secondary" : "outline"}
      aria-pressed={on ?? false}
      title={t("notifyMe.description")}
      disabled={on === null || saving}
      onClick={() => void toggle()}
    >
      {on ? <BellRingIcon /> : <BellPlusIcon />}
      {t("notifyMe.label")}
    </Button>
  );
}
