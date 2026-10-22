import { ChefHatIcon, HandIcon, ListChecksIcon, PackageMinusIcon, RepeatIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ShoppingItemSource } from "../types/shopping";

const ICONS: Record<ShoppingItemSource, LucideIcon> = {
  manual: HandIcon,
  staple: RepeatIcon,
  task: ListChecksIcon,
  low_stock: PackageMinusIcon,
  recipe: ChefHatIcon,
};

type ShoppingSourceBadgeProps = {
  source: ShoppingItemSource;
  /** Title of the task, for "For: Insulate the jacuzzi". */
  taskTitle?: string | null;
  /** Name of the recipe, for "For Spaghetti". */
  recipeName?: string | null;
  className?: string;
};

/** Why an item is on the list: added by hand, a weekly staple, material for a task, stock running low, or a meal to cook. */
export function ShoppingSourceBadge({ source, taskTitle, recipeName, className }: ShoppingSourceBadgeProps) {
  const { t } = useTranslation("shopping");
  const Icon = ICONS[source];
  const label =
    source === "task" && taskTitle
      ? t("source.taskNamed", { title: taskTitle })
      : source === "recipe" && recipeName
        ? t("source.recipeNamed", { name: recipeName })
        : t(`source.${source}`);
  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-56 gap-1 font-normal text-muted-foreground",
        source === "low_stock" && "border-warning/40 text-warning",
        className,
      )}
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
