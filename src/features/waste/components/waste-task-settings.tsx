import * as React from "react";
import { ListChecksIcon, MoonIcon, SunriseIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/shared/segmented-control";
import type { Habitant } from "@/features/household";
import { AssigneePicker } from "@/features/tasks";
import type { WasteActionResult } from "../data/waste-requests";
import { WASTE_TASK_TIMES, type WasteTaskSettings as Settings, type WasteTaskTiming } from "../types/waste";

type WasteTaskSettingsProps = {
  settings: Settings;
  habitants: Habitant[];
  canManage: boolean;
};

/**
 * "Create a task to put the bins out": on by default, the evening before (20:00) or the morning of the
 * collection (07:00), and optionally who does it, taking turns. Each change applies at once and updates
 * the open bins tasks.
 */
export function WasteTaskSettings({ settings, habitants, canManage }: WasteTaskSettingsProps) {
  const { t } = useTranslation("waste");
  const fetcher = useFetcher<WasteActionResult>({ key: "waste-tasks" });
  const [value, setValue] = React.useState(settings);
  const handled = React.useRef<WasteActionResult | undefined>(undefined);
  const saving = fetcher.state !== "idle";

  React.useEffect(() => {
    const result = fetcher.state === "idle" ? fetcher.data : undefined;
    if (!result || result === handled.current) return;
    handled.current = result;
    if (result.formError) toast.error(result.formError);
    else if (result.ok) toast.success(t("tasks.saved"));
  }, [fetcher.state, fetcher.data, t]);

  function save(next: Settings) {
    setValue(next);
    const form = new FormData();
    form.set("intent", "waste-tasks");
    form.set("enabled", String(next.enabled));
    form.set("timing", next.timing);
    form.set("rotate", String(next.rotate));
    for (const id of next.assigneeIds) form.append("assigneeIds", id);
    void fetcher.submit(form, { method: "post" });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3" aria-busy={saving || undefined}>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor="waste-task-enabled" className="flex min-w-0 cursor-pointer items-start gap-2">
          <ListChecksIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t("tasks.enabled")}</span>
            <span className="text-xs text-muted-foreground">{t("tasks.enabledHint")}</span>
          </span>
        </label>
        <Switch
          id="waste-task-enabled"
          checked={value.enabled}
          disabled={!canManage}
          onCheckedChange={(enabled) => save({ ...value, enabled })}
        />
      </div>

      {value.enabled && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("tasks.timing")}</span>
            <SegmentedControl<WasteTaskTiming>
              label={t("tasks.timing")}
              size="sm"
              options={[
                { value: "evening_before", label: t("tasks.timings.evening_before", { time: WASTE_TASK_TIMES.evening_before }), icon: MoonIcon },
                { value: "morning_of", label: t("tasks.timings.morning_of", { time: WASTE_TASK_TIMES.morning_of }), icon: SunriseIcon },
              ]}
              value={value.timing}
              onChange={(timing) => canManage && save({ ...value, timing })}
              className="self-start"
            />
          </div>

          {habitants.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("tasks.who")}</span>
              {canManage ? (
                <AssigneePicker
                  name="wasteTaskAssigneeIds"
                  label={t("tasks.who")}
                  habitants={habitants}
                  defaultValue={value.assigneeIds}
                  onChange={(assigneeIds) => save({ ...value, assigneeIds })}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {value.assigneeIds.length > 0
                    ? value.assigneeIds.flatMap((id) => habitants.find((habitant) => habitant.id === id)?.name ?? []).join(", ")
                    : t("tasks.nobody")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("tasks.whoHint")}</p>
              {value.assigneeIds.length > 1 && (
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={value.rotate}
                    disabled={!canManage}
                    onChange={(event) => save({ ...value, rotate: event.target.checked })}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{t("tasks.rotate")}</span>
                    <span className="text-xs text-muted-foreground">{t("tasks.rotateHint")}</span>
                  </span>
                </label>
              )}
            </div>
          )}

          <Link to="/tasks" className="self-start text-sm font-medium text-primary hover:underline">
            {t("tasks.viewTasks")}
          </Link>
        </>
      )}
    </div>
  );
}
