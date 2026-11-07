import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ShoppingStockFilter } from "./shopping-grouping";

/** Always visible toggle buttons, including on a phone; pressing an active filter clears it. */
export function ShoppingStockFilterField({
  value,
  onChange,
}: {
  value: ShoppingStockFilter;
  onChange: (value: ShoppingStockFilter) => void;
}) {
  const { t } = useTranslation("shopping");
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label={t("stockFilter.label")}
    >
      {(["all", "out", "nearly_out"] as const).map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          className="min-h-11"
          variant={value === option ? "secondary" : "ghost"}
          aria-pressed={value === option}
          onClick={() => onChange(value === option ? "all" : option)}
        >
          {t(`stockFilter.${option}`)}
        </Button>
      ))}
    </div>
  );
}
