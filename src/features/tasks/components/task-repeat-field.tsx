import * as React from "react";
import { RepeatIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RecurrenceFields } from "@/components/shared/recurrence-fields";
import { intlLocale } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { weekdayNames } from "@/lib/recurrence-format";
import { cn } from "@/lib/utils";
import { WEEKDAY_CODES, weekdayCodeOf, type WeekdayCode } from "@/types/recurrence";
import { REPEAT_PRESETS, presetRRule, repeatPresetOf, weekdaysOrStart, type RepeatPreset } from "../types/task-repeat";
import { firstDueDate } from "../types/tasks";
import { useTaskText } from "./use-task-text";

type TaskRepeatFieldProps = {
  /** Form field name of the RRULE (empty when it doesn't repeat). */
  name: string;
  defaultValue?: string | null;
  /** The due date the rule starts from (weekly presets repeat on its weekday); today when empty. */
  startDate: string;
  /** Start switched on, e.g. from "Repeat this". */
  defaultOn?: boolean;
  onChange?: (rrule: string) => void;
  /** Switching on without a due date: the form fills one in (a repeating task needs a first date). */
  onNeedsStartDate?: () => void;
  errors?: string[];
  id?: string;
};

/**
 * "Repeats": one switch right under the "When", then the common rules as chips (every day, every
 * Monday, every 2 weeks, monthly, yearly) with an optional end date, and "Custom" for everything else
 * (the shared `RecurrenceFields`: intervals, seasons, a number of times). Weekly and every 2 weeks get
 * weekday chips ("every Sunday" whatever the date): by default the due date's weekday; once picked, the
 * choice stays when the date changes, and the first time is the first picked day on or after the date.
 */
export function TaskRepeatField({ name, defaultValue, startDate, defaultOn = false, onChange, onNeedsStartDate, errors, id }: TaskRepeatFieldProps) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const generatedId = React.useId();
  const baseId = id ?? `task-repeat-${generatedId}`;
  const initial = repeatPresetOf(defaultValue, startDate);
  const [on, setOn] = React.useState(Boolean(initial) || defaultOn);
  const [preset, setPreset] = React.useState<RepeatPreset>(initial?.preset ?? "weekly");
  const [until, setUntil] = React.useState(initial?.until ?? "");
  const [custom, setCustom] = React.useState(initial?.preset === "custom" ? (defaultValue ?? "") : "");
  // `null`: follow the due date's weekday; otherwise the days picked (or stored on the task).
  const [pickedDays, setPickedDays] = React.useState<WeekdayCode[] | null>(() =>
    initial && initial.weekdays.join() !== weekdayCodeOf(startDate) ? initial.weekdays : null,
  );
  const weekdays = weekdaysOrStart(pickedDays, startDate);
  const longNames = weekdayNames(currentLocale(), "long");
  const shortNames = weekdayNames(currentLocale(), "short");
  const dayList = new Intl.ListFormat(intlLocale(currentLocale()), { type: "conjunction" }).format(
    weekdays.map((code) => longNames[WEEKDAY_CODES.indexOf(code)] ?? code),
  );

  const rrule = !on ? "" : preset === "custom" ? custom : presetRRule(preset, startDate, until || null, weekdays);
  const weekly = preset === "weekly" || preset === "biweekly";
  // "Every Sunday" picked on a Thursday: the first time is Sunday (the service starts it there too).
  const firstTime = on && weekly && rrule ? firstDueDate(rrule, startDate) : startDate;

  function toggleDay(code: WeekdayCode) {
    const next = weekdays.includes(code) ? weekdays.filter((day) => day !== code) : [...weekdays, code];
    // At least one day: removing the last one keeps it.
    if (next.length > 0) setPickedDays(WEEKDAY_CODES.filter((day) => next.includes(day)));
  }
  // Tell the form whenever the rule changes (it shows "take turns" only for repeating tasks).
  const reported = React.useRef(defaultValue ?? "");
  React.useEffect(() => {
    if (reported.current === rrule) return;
    reported.current = rrule;
    onChange?.(rrule);
  }, [rrule, onChange]);
  // "Repeat this" on a task without a due date: the form fills one in, once.
  const askStartDate = React.useRef(defaultOn && !initial);
  React.useEffect(() => {
    if (!askStartDate.current) return;
    askStartDate.current = false;
    onNeedsStartDate?.();
  }, [onNeedsStartDate]);

  function choose(next: RepeatPreset) {
    if (next === "custom" && preset !== "custom") setCustom(rrule || presetRRule("weekly", startDate));
    setPreset(next);
  }

  function toggle(next: boolean) {
    setOn(next);
    if (next) onNeedsStartDate?.();
  }

  const labels: Record<RepeatPreset, string> = {
    daily: t("repeat.presets.daily"),
    weekly: t("repeat.presets.weekly", { day: dayList }),
    biweekly: t("repeat.presets.biweekly"),
    monthly: t("repeat.presets.monthly"),
    yearly: t("repeat.presets.yearly"),
    custom: t("repeat.presets.custom"),
  };

  return (
    <div className="flex flex-col gap-3">
      {preset !== "custom" || !on ? <input type="hidden" name={name} value={rrule} /> : null}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={baseId} className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-medium">
          <RepeatIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("repeat.label")}
        </label>
        <Switch id={baseId} checked={on} onCheckedChange={toggle} />
      </div>

      {on && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <div role="radiogroup" aria-label={t("repeat.label")} className="flex flex-wrap gap-1.5">
            {REPEAT_PRESETS.map((value) => {
              const active = preset === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(value)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  )}
                >
                  {labels[value]}
                </button>
              );
            })}
          </div>

          {preset === "custom" ? (
            <RecurrenceFields
              key="custom"
              name={name}
              id={`${baseId}-custom`}
              defaultValue={custom}
              startDate={startDate}
              seasons
              allowNone={false}
              label=""
              onChange={setCustom}
            />
          ) : (
            <>
              {weekly && (
                <div role="group" aria-label={t("repeat.weekdays")} className="flex flex-wrap gap-1.5">
                  {WEEKDAY_CODES.map((code, index) => {
                    const active = weekdays.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={active}
                        aria-label={longNames[index]}
                        onClick={() => toggleDay(code)}
                        className={cn(
                          "inline-flex h-9 min-w-10 items-center justify-center rounded-full border px-2 text-sm font-medium capitalize transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                        )}
                      >
                        {shortNames[index]}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor={`${baseId}-until`}>{t("repeat.until")}</label>
                <Input
                  id={`${baseId}-until`}
                  type="date"
                  value={until}
                  min={startDate}
                  onChange={(event) => setUntil(event.target.value)}
                  className="w-auto"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {text.recurrence(rrule)}
                {firstTime !== startDate && ` · ${t("repeat.firstTime", { date: text.day(firstTime, { weekday: "short" }) })}`}
              </p>
            </>
          )}
        </div>
      )}
      {errors?.length ? <p className="text-xs font-medium text-destructive">{errors.join(" ")}</p> : null}
    </div>
  );
}
