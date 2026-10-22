import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AT_TASK_TIME,
  NOTIFICATION_GROUPS,
  resolveKindPreference,
  type KindPreference,
  type NotificationKindInfo,
  type NotificationPreferences,
} from "../types/notifications";

type NotificationKindListProps = {
  kinds: NotificationKindInfo[];
  preferences: NotificationPreferences;
  onChange: (kindId: string, preference: KindPreference) => void;
  disabled?: boolean;
};

/** Per kind, grouped (household, tasks, money, alarm…): on/off and, where it has one, the time. */
export function NotificationKindList({ kinds, preferences, onChange, disabled = false }: NotificationKindListProps) {
  const { t } = useTranslation("notifications");
  const { t: tAny } = useTranslation();
  const timeLabel = (time: string) => (time === AT_TASK_TIME ? t("kinds.atTaskTime") : t("kinds.at", { time }));

  return (
    <div className="flex flex-col gap-4">
      {NOTIFICATION_GROUPS.map((group) => {
        const inGroup = kinds.filter((kind) => kind.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`notification-group-${group}`} className="flex flex-col gap-1">
            <h4 id={`notification-group-${group}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t(`groups.${group}`)}
            </h4>
            <ul className="divide-y rounded-lg border">
              {inGroup.map((kind) => {
                const stored = preferences.kinds[kind.id];
                const setting = resolveKindPreference(kind, stored);
                const switchId = `notification-kind-${kind.id}`;
                return (
                  <li key={kind.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={switchId} className="flex flex-wrap items-center gap-2 font-medium">
                        {tAny(kind.titleKey)}
                        {kind.urgent && <Badge variant="outline">{t("kinds.urgent")}</Badge>}
                      </label>
                      <p className="text-sm text-muted-foreground">{tAny(kind.descriptionKey)}</p>
                      {kind.scoped && setting.enabled && (
                        <p className="text-sm text-muted-foreground">
                          {setting.scope.length > 0 ? t("kinds.scopedCount", { count: setting.scope.length }) : t("kinds.scopedNone")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      {kind.times && setting.enabled && (
                        <Select
                          value={setting.time ?? kind.defaultTime ?? kind.times[0]}
                          onValueChange={(time) => onChange(kind.id, { ...stored, enabled: true, time })}
                          disabled={disabled}
                        >
                          <SelectTrigger className="w-48" aria-label={`${t("kinds.when")}: ${tAny(kind.titleKey)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {kind.times.map((time) => (
                              <SelectItem key={time} value={time}>
                                {timeLabel(time)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Switch
                        id={switchId}
                        checked={setting.enabled}
                        onCheckedChange={(enabled) => onChange(kind.id, { ...stored, enabled })}
                        disabled={disabled}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
