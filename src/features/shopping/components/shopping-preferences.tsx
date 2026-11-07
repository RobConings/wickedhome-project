import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ProductCategory } from "../types/shopping";

export function AutomaticShoppingFilter({ included, onChange }: { included: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTranslation("shopping");
  return <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={included} onChange={(event) => onChange(event.target.checked)} />{t("planning.includeAutomatic")}</label>;
}

export function CategoryOrder({ order, onChange }: { order: ProductCategory[]; onChange: (value: ProductCategory[]) => void }) {
  const { t } = useTranslation("shopping");
  const move = (index: number, delta: number) => {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    onChange(next);
  };
  return <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">{t("planning.categoryOrder")}</summary><ol className="mt-3 space-y-1">{order.map((category, index) => <li className="flex items-center justify-between gap-2" key={category}><span>{t(`categories.${category}`)}</span><span><Button type="button" size="sm" variant="ghost" disabled={index === 0} aria-label={t("planning.moveUp", { name: t(`categories.${category}`) })} onClick={() => move(index, -1)}>↑</Button><Button type="button" size="sm" variant="ghost" disabled={index === order.length - 1} aria-label={t("planning.moveDown", { name: t(`categories.${category}`) })} onClick={() => move(index, 1)}>↓</Button></span></li>)}</ol></details>;
}
