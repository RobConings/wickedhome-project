import { useTranslation } from "react-i18next";
import { ScrollRow } from "./scroll-row";
import { cn } from "@/lib/utils";
import type { ShopType } from "../types/shops";
import { ShopTypeIcon } from "./shop-type-icon";

type ShopTypeFilterProps = {
  /** Types to offer, in display order. */
  types: readonly ShopType[];
  /** Selected type; `null` means all. */
  value: ShopType | null;
  onChange: (type: ShopType | null) => void;
  className?: string;
};

const chipClass =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4";

/** Chips to narrow a list of shops to one type. Scrolls sideways on small screens. */
export function ShopTypeFilter({ types, value, onChange, className }: ShopTypeFilterProps) {
  const { t } = useTranslation("shops");

  const chip = (type: ShopType | null) => {
    const active = value === type;
    return (
      <button
        key={type ?? "all"}
        type="button"
        aria-pressed={active}
        onClick={() => onChange(type)}
        className={cn(
          chipClass,
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {type && <ShopTypeIcon type={type} />}
        {type ? t(`types.${type}`) : t("filter.all")}
      </button>
    );
  };

  return (
    // One row that scrolls inside itself on phones (the chips are buttons: focus scrolls them into view); wraps from `sm`.
    <ScrollRow label={t("filter.label")} wrapFrom="sm" focusable={false} className={className}>
      {chip(null)}
      {types.map(chip)}
    </ScrollRow>
  );
}
