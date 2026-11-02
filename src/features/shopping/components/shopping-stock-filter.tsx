import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SHOPPING_STOCK_FILTERS, type ShoppingStockFilter } from "./shopping-grouping";

export function ShoppingStockFilterField({ value, onChange }: { value: ShoppingStockFilter; onChange: (value: ShoppingStockFilter) => void }) {
  const { t } = useTranslation("shopping");
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ShoppingStockFilter)}>
      <SelectTrigger className="w-full sm:w-56" aria-label={t("stockFilter.label")}><SelectValue /></SelectTrigger>
      <SelectContent>
        {SHOPPING_STOCK_FILTERS.map((option) => <SelectItem key={option} value={option}>{t(`stockFilter.${option}`)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
