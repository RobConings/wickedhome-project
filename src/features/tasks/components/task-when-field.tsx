import * as React from "react";
import { CalendarClockIcon, CalendarIcon, CalendarOffIcon, CalendarRangeIcon, ClockIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TASK_WHEN_KINDS, type TaskWhenKind } from "../types/tasks";
import { TASK_WHEN_NAMES, switchWhenKind, whenColumns, withStartDate, withStartTime, type TaskWhenValue } from "../types/task-when";

const KIND_ICONS: Record<TaskWhenKind, LucideIcon> = {
  none: CalendarOffIcon,
  day: CalendarIcon,
  moment: ClockIcon,
  slot: CalendarClockIcon,
  days: CalendarRangeIcon,
};

type TaskWhenFieldProps = {
  id: string;
  value: TaskWhenValue;
  onChange: (value: TaskWhenValue) => void;
  /** Today in the household time zone: the date a kind that needs one starts with. */
  today: string;
  /** Errors per posted name (`dueDate`, `dueTime`, `endTime`, `startDate`). */
  errorsFor?: (name: string) => string[] | undefined;
  disabled?: boolean;
  /** Label of the whole control; "When" by default. */
  label?: React.ReactNode;
};

/**
 * "When" of a task: None / Day / Time / Timeslot / Several days as chips (they wrap, never scroll), then only
 * the date and time inputs that kind needs, one column on phones. Posts `dueDate`, `dueTime`, `endTime` and
 * `startDate` as hidden inputs ("" when not used), so the task form and the API keep their columns.
 */
export function TaskWhenField({ id, value, onChange, today, errorsFor, disabled = false, label }: TaskWhenFieldProps) {
  const { t } = useTranslation("tasks");
  const columns = whenColumns(value);
  const errors = TASK_WHEN_NAMES.flatMap((name) => errorsFor?.(name) ?? []);
  const errorId = `${id}-error`;
  const invalid = (name: (typeof TASK_WHEN_NAMES)[number]) => Boolean(errorsFor?.(name)?.length) || undefined;
  const describedBy = errors.length ? errorId : undefined;

  const dateInput = (inputId: string, inputLabel: string, inputValue: string, set: (next: string) => void, name: (typeof TASK_WHEN_NAMES)[number], min?: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={inputId}>{inputLabel}</Label>
      <Input
        id={inputId}
        type="date"
        value={inputValue}
        min={min}
        onChange={(event) => set(event.target.value)}
        disabled={disabled}
        aria-invalid={invalid(name)}
        aria-describedby={describedBy}
      />
    </div>
  );

  const timeInput = (inputId: string, inputLabel: string, inputValue: string, set: (next: string) => void, name: (typeof TASK_WHEN_NAMES)[number]) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={inputId}>{inputLabel}</Label>
      <Input
        id={inputId}
        type="time"
        step={60}
        value={inputValue}
        onChange={(event) => set(event.target.value)}
        disabled={disabled}
        aria-invalid={invalid(name)}
        aria-describedby={describedBy}
      />
    </div>
  );

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{label ?? t("when.label")}</legend>
      {TASK_WHEN_NAMES.map((name) => (
        <input key={name} type="hidden" name={name} value={columns[name]} />
      ))}
      <div role="radiogroup" aria-label={t("when.label")} className="flex flex-wrap gap-1.5">
        {TASK_WHEN_KINDS.map((kind) => {
          const Icon = KIND_ICONS[kind];
          const active = value.kind === kind;
          return (
            <button
              key={kind}
              id={kind === value.kind ? id : undefined}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(switchWhenKind(value, kind, today))}
              className={cn(
                "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t(`when.kinds.${kind}`)}</span>
            </button>
          );
        })}
      </div>

      {value.kind !== "none" && (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {value.kind === "days" ? (
            <>
              {dateInput(`${id}-start`, t("when.from"), value.startDate, (next) => onChange(withStartDate(value, next)), "startDate")}
              {dateInput(`${id}-end`, t("when.to"), value.date, (next) => onChange({ ...value, date: next }), "dueDate", value.startDate || undefined)}
            </>
          ) : (
            <div className={cn("min-w-0", value.kind === "slot" && "sm:col-span-2")}>
              {dateInput(`${id}-date`, t("when.date"), value.date, (next) => onChange({ ...value, date: next }), "dueDate")}
            </div>
          )}
          {value.kind === "moment" && timeInput(`${id}-time`, t("when.time"), value.time, (next) => onChange(withStartTime(value, next)), "dueTime")}
          {value.kind === "slot" && (
            <>
              {timeInput(`${id}-start-time`, t("when.startTime"), value.time, (next) => onChange(withStartTime(value, next)), "dueTime")}
              {timeInput(`${id}-end-time`, t("when.endTime"), value.endTime, (next) => onChange({ ...value, endTime: next }), "endTime")}
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t(`when.hints.${value.kind}`)}</p>
      {errors.length > 0 && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {errors.join(" ")}
        </p>
      )}
    </fieldset>
  );
}
