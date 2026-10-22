import {
  CarIcon,
  DropletIcon,
  FileTextIcon,
  FuelIcon,
  GiftIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  HeartPulseIcon,
  HouseIcon,
  LandmarkIcon,
  PawPrintIcon,
  RepeatIcon,
  ShieldCheckIcon,
  ShirtIcon,
  ShoppingBasketIcon,
  SparklesIcon,
  SprayCanIcon,
  TicketIcon,
  UtensilsIcon,
  WifiIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SectionAccent } from "@/lib/section-accent";
import { cn } from "@/lib/utils";
import type { ExpenseCategory } from "../types/expenses";

const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  energy: ZapIcon,
  water: DropletIcon,
  internet_phone: WifiIcon,
  insurance: ShieldCheckIcon,
  taxes: LandmarkIcon,
  housing: HouseIcon,
  healthcare: HeartPulseIcon,
  school_childcare: GraduationCapIcon,
  car: CarIcon,
  subscriptions: RepeatIcon,
  loans: HandCoinsIcon,
  groceries: ShoppingBasketIcon,
  household: SprayCanIcon,
  eating_out: UtensilsIcon,
  transport: FuelIcon,
  leisure: TicketIcon,
  gifts: GiftIcon,
  clothing: ShirtIcon,
  personal_care: SparklesIcon,
  pets: PawPrintIcon,
  other: FileTextIcon,
};

/**
 * Each category in one of the app's accent hues (docs/BRANDING.md), so a list of expenses scans by colour:
 * utilities warm/cool by kind, food orange, people pink… `undefined` = the page's own accent.
 */
const CATEGORY_ACCENTS: Record<ExpenseCategory, SectionAccent | undefined> = {
  energy: "energy",
  water: "documents",
  internet_phone: "devices",
  insurance: "integrations",
  taxes: "integrations",
  housing: "home",
  healthcare: "assistant",
  school_childcare: "calendar",
  car: "tasks",
  subscriptions: "calendar",
  loans: "integrations",
  groceries: "shopping",
  household: "home",
  eating_out: "shopping",
  transport: "tasks",
  leisure: "assistant",
  gifts: "assistant",
  clothing: "calendar",
  personal_care: "assistant",
  pets: "energy",
  other: undefined,
};

type ExpenseCategoryIconProps = {
  category: ExpenseCategory;
  size?: "sm" | "md";
  className?: string;
};

/** The category's icon on a soft round tile in the category's colour, labelled for screen readers. */
export function ExpenseCategoryIcon({ category, size = "md", className }: ExpenseCategoryIconProps) {
  const { t } = useTranslation("expenses");
  const Icon = CATEGORY_ICONS[category];
  return (
    <span
      role="img"
      aria-label={t(`categories.${category}`)}
      title={t(`categories.${category}`)}
      data-accent={CATEGORY_ACCENTS[category]}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-section-soft text-section",
        size === "sm" ? "size-7 [&>svg]:size-3.5" : "size-10 [&>svg]:size-5",
        className,
      )}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}
