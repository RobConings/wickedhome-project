import type * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The value of a filter's "all" option (no filter). */
export const FILTER_ALL = "all";

export type FilterOption = {
  value: string;
  /** May hold an icon before the text (`<><Icon aria-hidden="true" />{name}</>`). */
  label: React.ReactNode;
};

type FilterSelectProps = {
  /** Accessible name of the trigger, e.g. "Kind". */
  label: string;
  /** The chosen value; `null`/`undefined` shows the "all" option. */
  value: string | null | undefined;
  /** The raw value, `allValue` included. */
  onValueChange?: (value: string) => void;
  /** The value, or `null` for the "all" option. */
  onChange?: (value: string | null) => void;
  /** Text of the "all" option, e.g. "All kinds". */
  allLabel: React.ReactNode;
  allValue?: string;
  options: readonly FilterOption[];
  /** Trigger classes; full width on phones and 12 rem from `sm` by default. */
  className?: string;
  size?: React.ComponentProps<typeof SelectTrigger>["size"];
};

/**
 * One filter in a list toolbar: a select with an "all" option first. Put several in the `toolbar` of a
 * `GeneralList` (`flex flex-col gap-3 sm:flex-row`); they stack on phones.
 */
export function FilterSelect({
  label,
  value,
  onValueChange,
  onChange,
  allLabel,
  allValue = FILTER_ALL,
  options,
  className = "w-full sm:w-48",
  size,
}: FilterSelectProps) {
  return (
    <Select
      value={value ?? allValue}
      onValueChange={(next) => {
        onValueChange?.(next);
        onChange?.(next === allValue ? null : next);
      }}
    >
      <SelectTrigger size={size} className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
