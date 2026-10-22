import * as React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { CONTACT_TRADES, foldText, tradeLabel, type ContactTrade } from "../types/contacts";

type TradeInputProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Which suggestions (keys of `CONTACT_TRADES`); default all. */
  suggestions?: readonly ContactTrade["key"][];
  /** Trades or roles the household already uses, suggested too (as typed). */
  extra?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Free text with suggestions for a trade ("aannemer", "loodgieter"…) or a project role: the suggestions are in the
 * current language, plus what the household already typed elsewhere. Stored as typed.
 */
export function TradeInput({ id, name, value, onChange, suggestions, extra = [], placeholder, disabled, invalid, describedBy }: TradeInputProps) {
  const { i18n } = useTranslation();
  const listId = `${id}-suggestions`;
  const locale = i18n.resolvedLanguage === "nl" ? "nl" : "en";
  const options = React.useMemo(() => {
    const trades = suggestions ? CONTACT_TRADES.filter((trade) => suggestions.includes(trade.key)) : CONTACT_TRADES;
    const words = [...extra, ...trades.map((trade) => tradeLabel(trade, locale))];
    return [...new Map(words.filter((word) => word.trim()).map((word) => [foldText(word), word])).values()];
  }, [suggestions, extra, locale]);

  return (
    <>
      <Input
        id={id}
        name={name}
        list={listId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        maxLength={60}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}
