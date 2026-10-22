import { useTranslation } from "react-i18next";
import { LOCALES, type Locale } from "@/types/common";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
};

/** Compact EN | NL toggle. */
export function LanguageSwitcher({ value, onChange, className }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t("language.label")} className={cn("inline-flex rounded-md border p-0.5", className)}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          role="radio"
          aria-checked={value === locale}
          aria-label={t(`language.${locale}`)}
          onClick={() => onChange(locale)}
          className={cn(
            "rounded-sm px-2 py-0.5 text-xs font-semibold uppercase transition-colors",
            value === locale ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
