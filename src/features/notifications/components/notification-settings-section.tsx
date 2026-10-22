import * as React from "react";
import { KeyRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ErrorState } from "./error-state";
import { InlineAlert } from "./inline-alert";
import { SkeletonBlock, SkeletonList } from "./loading-state";
import { Button } from "@/components/ui/button";
import { notificationsClient, type NotificationsClient } from "../data/notifications-requests";
import { browserPush, PushPermissionError, type PushBrowser, type PushSupport } from "../data/push-support";
import type { KindPreference, NotificationSettings, PushDevice, QuietHours } from "../types/notifications";
import { NotificationKindList } from "./notification-kind-list";
import { PushDeviceList } from "./push-device-list";
import { PushEnablePanel } from "./push-enable-panel";
import { QuietHoursFields } from "./quiet-hours-fields";

type NotificationSettingsSectionProps = {
  /** API access; stories pass a fake. */
  client?: NotificationsClient;
  /** The browser's push abilities; stories pass a fake (iPhone, blocked, …). */
  browser?: PushBrowser;
};

type Loaded = NotificationSettings & { currentEndpoint: string | null };

/**
 * Settings → Notifications, for everyone (each person their own): turn on push on this device (the
 * permission prompt only comes from a click), the devices that get them, quiet hours, what to notify and
 * when, and a test notification. Loads its own data; each change is saved at once.
 */
export function NotificationSettingsSection({ client = notificationsClient, browser = browserPush }: NotificationSettingsSectionProps) {
  const { t } = useTranslation("notifications");
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [support, setSupport] = React.useState<PushSupport>(() => browser.support());
  const [enabling, setEnabling] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([client.settings(), browser.currentEndpoint().catch(() => null)])
      .then(([settings, currentEndpoint]) => {
        if (!cancelled) setLoaded({ ...settings, currentEndpoint });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, browser, retry]);

  if (!loaded) {
    if (failed) {
      return (
        <ErrorState
          title={t("section.error")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setFailed(false);
                setRetry((value) => value + 1);
              }}
            >
              {t("common:actions.retry")}
            </Button>
          }
        />
      );
    }
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("section.loading")}>
        <SkeletonBlock className="h-20" />
        <SkeletonList rows={4} />
      </div>
    );
  }

  const enabled = loaded.currentEndpoint !== null && loaded.devices.some((device) => device.endpoint === loaded.currentEndpoint);

  async function enable() {
    if (!loaded) return;
    setEnabling(true);
    setDismissed(false);
    try {
      const subscription = await browser.subscribe(loaded.publicKey);
      const device = await client.registerDevice(subscription);
      setLoaded((current) =>
        current ? { ...current, currentEndpoint: device.endpoint, devices: [...current.devices.filter((other) => other.id !== device.id), device] } : current,
      );
      toast.success(t("push.enabled"));
    } catch (error) {
      if (error instanceof PushPermissionError) {
        if (error.permission === "denied") setSupport("denied");
        else setDismissed(true);
      } else {
        toast.error(t("push.enableFailed"));
      }
    } finally {
      setEnabling(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const result = await client.test();
      if (result.devices === 0) toast.info(t("push.testNoDevice"));
      else if (result.pushed) toast.success(t("push.testSent"));
      else toast.error(t("push.testFailed"));
    } catch {
      toast.error(t("push.testFailed"));
    } finally {
      setTesting(false);
    }
  }

  async function remove(device: PushDevice) {
    try {
      await client.removeDevice(device.id);
      if (device.endpoint === loaded?.currentEndpoint) await browser.unsubscribe().catch(() => undefined);
      setLoaded((current) =>
        current
          ? {
              ...current,
              devices: current.devices.filter((other) => other.id !== device.id),
              currentEndpoint: device.endpoint === current.currentEndpoint ? null : current.currentEndpoint,
            }
          : current,
      );
      toast.success(t("devices.removed"));
    } catch {
      toast.error(t("devices.removeFailed"));
    }
  }

  /** Optimistic save of quiet hours or one kind; rolls back with a toast on failure. */
  async function save(change: { quietHours?: QuietHours; kinds?: Record<string, KindPreference> }) {
    if (!loaded) return;
    const previous = loaded.preferences;
    setLoaded({
      ...loaded,
      preferences: { quietHours: change.quietHours ?? previous.quietHours, kinds: { ...previous.kinds, ...change.kinds } },
    });
    setSaving(true);
    try {
      const preferences = await client.savePreferences(change);
      setLoaded((current) => (current ? { ...current, preferences } : current));
      toast.success(t("saved"), { id: "notification-settings-saved" });
    } catch {
      setLoaded((current) => (current ? { ...current, preferences: previous } : current));
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-labelledby="notifications-this-device">
        <h3 id="notifications-this-device" className="font-medium">
          {t("push.title")}
        </h3>
        <PushEnablePanel
          support={support}
          enabled={enabled}
          enabling={enabling}
          testing={testing}
          dismissed={dismissed}
          onEnable={() => void enable()}
          onTest={() => void test()}
        />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="notifications-devices">
        <h3 id="notifications-devices" className="font-medium">
          {t("devices.title")}
        </h3>
        <PushDeviceList devices={loaded.devices} currentEndpoint={loaded.currentEndpoint} onRemove={remove} />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="notifications-quiet">
        <h3 id="notifications-quiet" className="font-medium">
          {t("quiet.title")}
        </h3>
        <QuietHoursFields value={loaded.preferences.quietHours} onChange={(quietHours) => void save({ quietHours })} disabled={saving} />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="notifications-kinds">
        <h3 id="notifications-kinds" className="font-medium">
          {t("kinds.title")}
        </h3>
        <NotificationKindList
          kinds={loaded.kinds}
          preferences={loaded.preferences}
          onChange={(kindId, preference) => void save({ kinds: { [kindId]: preference } })}
        />
      </section>

      {loaded.keyStorage === "plain" && (
        <InlineAlert>
          <KeyRoundIcon />
          <p className="text-muted-foreground">{t("keyStorage.plain")}</p>
        </InlineAlert>
      )}
    </div>
  );
}
