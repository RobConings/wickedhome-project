import * as React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentLocale } from "@/lib/i18n";
import { describeRecurrence, weekdayNames } from "@/lib/recurrence-format";
import { cn } from "@/lib/utils";
import {
  MAX_COUNT,
  MAX_INTERVAL,
  RRULE_FREQUENCIES,
  SEASONS,
  WEEKDAY_CODES,
  formatRRule,
  parseRRule,
  seasonOf,
  seasonRRule,
  weekdayCodeOf,
  type RRuleFrequency,
  type Season,
  type WeekdayCode,
} from "@/types/recurrence";
import { SegmentedControl } from "./segmented-control";

const RECURRENCE_ENDS = ["never", "until", "count"] as const;
export type RecurrenceEnds = (typeof RECURRENCE_ENDS)[number];

type Repeat = RRuleFrequency | "none" | "SEASONAL";

type RecurrenceState = {
  repeat: Repeat;
  interval: number;
  byDay: WeekdayCode[];
  season: Season;
  ends: RecurrenceEnds;
  until: string;
  count: number;
};

function initialState(rrule: string | null | undefined, startDate: string, allowNone: boolean, fallback: Repeat): RecurrenceState {
  const rule = rrule ? parseRRule(rrule) : null;
  const season = rule ? seasonOf(rule) : null;
  return {
    repeat: season ? "SEASONAL" : (rule?.freq ?? (allowNone ? "none" : fallback)),
    interval: rule?.interval ?? 1,
    byDay: rule?.byDay ?? [weekdayCodeOf(startDate)],
    season: season ?? "spring",
    ends: rule?.until ? "until" : rule?.count ? "count" : "never",
    until: rule?.until ?? "",
    count: rule?.count ?? 10,
  };
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(1, Math.round(value) || 1));

function toRRule(state: RecurrenceState, weekdays: boolean): string {
  if (state.repeat === "none") return "";
  const end = {
    until: state.ends === "until" && state.until ? state.until : undefined,
    count: state.ends === "count" ? clamp(state.count, MAX_COUNT) : undefined,
  };
  const interval = clamp(state.interval, MAX_INTERVAL);
  if (state.repeat === "SEASONAL") return formatRRule(seasonRRule(state.season, { interval, ...end }));
  return formatRRule({
    freq: state.repeat,
    interval,
    byDay: state.repeat === "WEEKLY" && weekdays ? state.byDay : undefined,
    ...end,
  });
}

type RecurrenceFieldsProps = {
  /** Form field name of the resulting RRULE (empty when it doesn't repeat). */
  name: string;
  defaultValue?: string | null;
  /** DTSTART (e.g. the start or first due date); picks the default weekday for weekly rules. */
  startDate: string;
  /** Frequencies to offer, in this order. Defaults to all. */
  frequencies?: readonly RRuleFrequency[];
  /** Also offer seasonal windows ("every spring"). */
  seasons?: boolean;
  /** Let weekly rules pick weekdays (BYDAY). Off: a weekly rule repeats on DTSTART's weekday. */
  weekdays?: boolean;
  /** How a series may end. Only `["never"]` hides the end settings. */
  ends?: readonly RecurrenceEnds[];
  /** Offer "Doesn't repeat" (off when editing something that must repeat). */
  allowNone?: boolean;
  /** Label of the repeat select; defaults to "Repeat". */
  label?: string;
  /** Id of the repeat select, for an outer `<label htmlFor>`. Generated when omitted. */
  id?: string;
  errors?: string[];
  onChange?: (rrule: string) => void;
  /**
   * The end follows from something else (e.g. an amount to pay off): the end settings are replaced by
   * `description` (read-only) and the rule posted ends on `until` (`null`: no end). Leave it out to give the
   * end settings back.
   */
  lockedEnd?: { until: string | null; description: React.ReactNode };
  className?: string;
};

/**
 * Repeat settings (frequency, interval, weekdays, season, end) producing an RFC 5545 RRULE in a hidden
 * input, with a plain-language summary. Domain-agnostic: each feature picks the options it supports.
 */
export function RecurrenceFields({
  name,
  defaultValue,
  startDate,
  frequencies = RRULE_FREQUENCIES,
  seasons = false,
  weekdays = true,
  ends = RECURRENCE_ENDS,
  allowNone = true,
  label,
  id,
  errors,
  onChange,
  lockedEnd,
  className,
}: RecurrenceFieldsProps) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const generatedId = React.useId();
  const baseId = id ?? `recurrence-${generatedId}`;
  const [state, setState] = React.useState(() =>
    initialState(defaultValue, startDate, allowNone, frequencies[0] ?? "WEEKLY"),
  );
  const rrule = toRRule(
    lockedEnd ? { ...state, ends: lockedEnd.until ? "until" : "never", until: lockedEnd.until ?? "" } : state,
    weekdays,
  );
  const dayNames = weekdayNames(locale, "narrow");
  const longDayNames = weekdayNames(locale, "long");
  const showEnds = ends.some((value) => value !== "never");

  const update = (patch: Partial<RecurrenceState>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange?.(toRRule(next, weekdays));
  };

  const repeatOptions: Repeat[] = [...(allowNone ? (["none"] as const) : []), ...frequencies, ...(seasons ? (["SEASONAL"] as const) : [])];
  const unitKey = state.repeat === "SEASONAL" ? "YEARLY" : state.repeat;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <input type="hidden" name={name} value={rrule} />
      <div className="flex flex-col gap-2">
        {label !== "" && (
          <label htmlFor={baseId} className="text-sm font-medium">
            {label ?? t("recurrence.repeat")}
          </label>
        )}
        <Select value={state.repeat} onValueChange={(repeat) => update({ repeat: repeat as Repeat })}>
          <SelectTrigger id={baseId} className="w-full" aria-invalid={errors?.length ? true : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {repeatOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`recurrence.options.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state.repeat !== "none" && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          {state.repeat === "SEASONAL" && (
            <SegmentedControl
              label={t("recurrence.season")}
              size="sm"
              options={SEASONS.map((value) => ({ value, label: t(`recurrence.seasons.${value}`) }))}
              value={state.season}
              onChange={(season) => update({ season })}
              className="self-start"
            />
          )}

          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={`${baseId}-interval`}>{t("recurrence.every")}</label>
            <Input
              id={`${baseId}-interval`}
              type="number"
              min={1}
              max={MAX_INTERVAL}
              value={state.interval}
              onChange={(event) => update({ interval: Number(event.target.value) })}
              className="w-20"
            />
            <span>{t(`recurrence.unit.${unitKey}`, { count: state.interval })}</span>
          </div>

          {state.repeat === "WEEKLY" && weekdays && (
            <div role="group" aria-label={t("recurrence.weekdays")} className="flex flex-wrap gap-1.5">
              {WEEKDAY_CODES.map((code, index) => {
                const active = state.byDay.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={active}
                    aria-label={longDayNames[index]}
                    title={longDayNames[index]}
                    onClick={() =>
                      update({
                        // At least one day stays selected.
                        byDay: active
                          ? state.byDay.length > 1
                            ? state.byDay.filter((day) => day !== code)
                            : state.byDay
                          : [...state.byDay, code],
                      })
                    }
                    className={cn(
                      "grid size-8 place-items-center rounded-full border text-xs font-medium uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                    )}
                  >
                    {dayNames[index]}
                  </button>
                );
              })}
            </div>
          )}

          {lockedEnd && (
            <div className="flex flex-col gap-0.5 text-sm">
              <span>{t("recurrence.ends")}</span>
              <span className="text-muted-foreground">{lockedEnd.description}</span>
            </div>
          )}

          {showEnds && !lockedEnd && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span id={`${baseId}-ends`}>{t("recurrence.ends")}</span>
              <Select value={state.ends} onValueChange={(value) => update({ ends: value as RecurrenceEnds })}>
                <SelectTrigger className="w-32" aria-labelledby={`${baseId}-ends`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ends.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`recurrence.endsOptions.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.ends === "until" && (
                <Input
                  type="date"
                  aria-labelledby={`${baseId}-ends`}
                  value={state.until}
                  min={startDate}
                  onChange={(event) => update({ until: event.target.value })}
                  className="w-auto"
                />
              )}
              {state.ends === "count" && (
                <>
                  <Input
                    type="number"
                    aria-labelledby={`${baseId}-ends`}
                    min={1}
                    max={MAX_COUNT}
                    value={state.count}
                    onChange={(event) => update({ count: Number(event.target.value) })}
                    className="w-20"
                  />
                  <span>{t("recurrence.occurrences", { count: state.count })}</span>
                </>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">{describeRecurrence(rrule, locale, t)}</p>
        </div>
      )}
      {errors?.length ? <p className="text-xs font-medium text-destructive">{errors.join(" ")}</p> : null}
    </div>
  );
}
