import { ArrowDownUpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ShopViewSort } from "./shopping-grouping";

/** Ordinary checklist order; shop view retains its additional price/priority choices. */
export function ShoppingSortField({ value, onChange }: { value: ShopViewSort; onChange: (value: ShopViewSort) => void }) {
  const { t } = useTranslation("shopping");
  return <Select value={value} onValueChange={(next) => onChange(next as ShopViewSort)}>
    <SelectTrigger className="w-full sm:w-48" aria-label={t("shopView.sort.label")}><ArrowDownUpIcon aria-hidden="true" /><SelectValue /></SelectTrigger>
    <SelectContent>{(["category", "name"] as const).map((option) => <SelectItem key={option} value={option}>{t(`shopView.sort.${option}`)}</SelectItem>)}</SelectContent>
  </Select>;
}
