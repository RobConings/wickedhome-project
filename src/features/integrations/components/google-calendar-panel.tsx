import * as React from "react";
import { RefreshCwIcon, SendIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InlineAlert } from "./inline-alert";
import { CALENDAR_CATEGORIES } from "@/features/calendar";
import { currentLocale } from "@/lib/i18n";
import { formatDateTime } from "@/types/date-format";
import type { GoogleClient } from "../data/google-client";
import type { GoogleCalendarInfo, GoogleCalendarSettings, GoogleCalendarVisibility, GoogleFeature, GoogleStatus } from "../types/google";

type GoogleCalendarPanelProps = {
  settings: GoogleCalendarSettings;
  client: GoogleClient;
  onStatus: (status: GoogleStatus) => void;
  /** Asks Google for more scopes (publishing needs write access). */
  onConnect: (features: GoogleFeature[]) => void;
  canPublish: boolean;
  connectDisabled?: boolean;
};

const OFF = "off";
const when = (iso: string) => formatDateTime(iso, currentLocale());

/**
 * The person's Google calendars: which ones show on the WickedHome calendar (and for whom), "Sync now", and
 * optionally publishing household events of chosen categories to one of their calendars (off by default).
 */
export function GoogleCalendarPanel({ settings, client, onStatus, onConnect, canPublish, connectDisabled }: GoogleCalendarPanelProps) {
  const { t } = useTranslation("integrations");
  const { t: tCalendar } = useTranslation("calendar");
  const { t: tCommon } = useTranslation();
  const [calendars, setCalendars] = React.useState(settings.calendars);
  const [busy, setBusy] = React.useState<"sync" | "refresh" | "publish" | null>(null);
  const [target, setTarget] = React.useState(settings.publish.calendarId ?? OFF);
  const [categories, setCategories] = React.useState<string[]>(settings.publish.categories);

  // Fresh status from the parent (after a sync) replaces the local copy, during render.
  const [previous, setPrevious] = React.useState(settings);
  if (settings !== previous) {
    setPrevious(settings);
    setCalendars(settings.calendars);
    setTarget(settings.publish.calendarId ?? OFF);
    setCategories(settings.publish.categories);
  }

  const update = (calendar: GoogleCalendarInfo, change: { selected?: boolean; visibility?: GoogleCalendarVisibility }) => {
    // Optimistic: the switch moves at once and rolls back with a toast when saving fails.
    setCalendars((list) => list.map((item) => (item.id === calendar.id ? { ...item, ...change } : item)));
    client
      .updateCalendar(calendar.id, change)
      .then((saved) => setCalendars((list) => list.map((item) => (item.id === saved.id ? saved : item))))
      .catch(() => {
        setCalendars((list) => list.map((item) => (item.id === calendar.id ? calendar : item)));
        toast.error(tCommon("errors.generic"));
      });
  };

  const run = (kind: "sync" | "refresh") => {
    setBusy(kind);
    const work =
      kind === "sync"
        ? client.syncCalendars().then((next) => {
            onStatus(next);
            toast.success(t("google.calendar.synced"));
          })
        : client.refreshCalendars().then(setCalendars);
    work.catch(() => toast.error(t("google.calendar.syncFailed"))).finally(() => setBusy(null));
  };

  const savePublish = () => {
    setBusy("publish");
    client
      .savePublish({ calendarId: target === OFF ? null : target, categories })
      .then((next) => {
        onStatus(next);
        toast.success(target === OFF ? t("google.publish.turnedOff") : t("google.publish.saved"));
      })
      .catch(() => toast.error(tCommon("errors.generic")))
      .finally(() => setBusy(null));
  };

  const lastSynced = calendars
    .map((calendar) => calendar.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  const failing = calendars.filter((calendar) => calendar.selected && calendar.lastError);
  const writable = calendars.filter((calendar) => calendar.canWrite);
  const publishChanged =
    (settings.publish.calendarId ?? OFF) !== target || [...settings.publish.categories].sort().join() !== [...categories].sort().join();

  return (
    <div className="flex flex-col gap-4 pl-0 sm:pl-6">
      {calendars.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("google.calendar.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t("google.calendar.listLabel")}>
          {calendars.map((calendar) => (
            <li key={calendar.id} className="flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
                <Switch checked={calendar.selected} onCheckedChange={(selected) => update(calendar, { selected })} aria-label={t("google.calendar.show", { name: calendar.name })} />
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: calendar.color }} aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{calendar.name}</span>
                  {calendar.primary && <span className="text-xs text-muted-foreground">{t("google.calendar.primary")}</span>}
                </span>
              </label>
              {calendar.selected && (
                <Select value={calendar.visibility} onValueChange={(value) => update(calendar, { visibility: value as GoogleCalendarVisibility })}>
                  <SelectTrigger className="w-full sm:w-44" aria-label={t("google.calendar.visibilityLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="household">{t("google.calendar.visibility.household")}</SelectItem>
                    <SelectItem value="private">{t("google.calendar.visibility.private")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </li>
          ))}
        </ul>
      )}

      {failing.length > 0 && (
        <InlineAlert tone="error">{t("google.calendar.failing", { names: failing.map((calendar) => calendar.name).join(", ") })}</InlineAlert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => run("sync")} loading={busy === "sync"} disabled={busy !== null}>
          <RefreshCwIcon />
          {t("google.calendar.syncNow")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => run("refresh")} loading={busy === "refresh"} disabled={busy !== null}>
          {t("google.calendar.refreshList")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {lastSynced ? t("google.calendar.lastSynced", { time: when(lastSynced) }) : t("google.calendar.neverSynced")}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <SendIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("google.publish.title")}
          </span>
          <span className="text-xs text-muted-foreground">{t("google.publish.description")}</span>
        </div>
        {!canPublish ? (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => onConnect(["calendar_publish"])} disabled={connectDisabled}>
            {t("google.publish.allow")}
          </Button>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="google-publish-target">{t("google.publish.target")}</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="google-publish-target" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OFF}>{t("google.publish.off")}</SelectItem>
                  {writable.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {target !== OFF && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">{t("google.publish.categories")}</legend>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {CALENDAR_CATEGORIES.map((category) => (
                    <label key={category} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={categories.includes(category)}
                        onChange={(event) =>
                          setCategories((list) => (event.target.checked ? [...list, category] : list.filter((item) => item !== category)))
                        }
                      />
                      {tCalendar(`categories.${category}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {settings.publish.lastError && <InlineAlert tone="error">{t("google.publish.failed", { error: settings.publish.lastError })}</InlineAlert>}
            {settings.publish.calendarId && settings.publish.lastPublishedAt && (
              <p className="text-xs text-muted-foreground">
                {t("google.publish.status", { count: settings.publish.publishedCount, time: when(settings.publish.lastPublishedAt) })}
              </p>
            )}
            <Button size="sm" className="w-fit" onClick={savePublish} loading={busy === "publish"} disabled={!publishChanged || busy !== null || (target !== OFF && categories.length === 0)}>
              {tCommon("actions.save")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
