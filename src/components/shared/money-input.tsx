import * as React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { currentLocale } from "@/lib/i18n";
import { formatCentsForInput, parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<React.ComponentProps<"input">, "name" | "value" | "defaultValue" | "onChange" | "type"> & {
  /** Renders a hidden input with this name holding the amount in integer cents (empty when invalid). */
  name?: string;
  defaultValueCents?: number | null;
  /** Called with the parsed amount in cents, or `null` when empty or not a valid amount. */
  onValueChange?: (cents: number | null) => void;
  /** Currency sign shown inside the field. */
  currencySymbol?: string;
};

/**
 * Amount field for EUR. People type "12,50", "1.234,56" or "12.50"; the form receives integer cents.
 * The text is tidied to the locale's notation when the field loses focus.
 */
export function MoneyInput({
  name,
  defaultValueCents,
  onValueChange,
  currencySymbol = "€",
  className,
  onBlur,
  ...props
}: MoneyInputProps) {
  useTranslation(); // re-render when the language changes
  const locale = currentLocale();
  const [text, setText] = React.useState(() =>
    defaultValueCents === null || defaultValueCents === undefined ? "" : formatCentsForInput(defaultValueCents, locale),
  );
  const cents = parseMoneyToCents(text);

  return (
    <div className={cn("relative", className)}>
      <span
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        {currencySymbol}
      </span>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="pl-7 tabular-nums"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onValueChange?.(parseMoneyToCents(event.target.value));
        }}
        onBlur={(event) => {
          if (cents !== null) setText(formatCentsForInput(cents, locale));
          onBlur?.(event);
        }}
      />
      {name && <input type="hidden" name={name} value={cents ?? ""} />}
    </div>
  );
}
