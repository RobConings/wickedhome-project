import {
  BanknoteIcon,
  BotIcon,
  CalendarPlusIcon,
  ChefHatIcon,
  ListPlusIcon,
  type LucideIcon,
  ReceiptIcon,
  ScanBarcodeIcon,
  ShoppingCartIcon,
} from "lucide-react";
import type { QuickActionItem } from "@/components/shared/quick-actions";
import type { Role } from "@/features/auth";
import type { SectionAccent } from "@/lib/section-accent";

/**
 * The quick actions: the one list behind the "+" in the phone top bar, the "+ Quick action" menu in the
 * desktop sidebar and the command palette (Ctrl/Cmd + K, "/", "N"). Each one goes to a screen that opens
 * its form from the URL (`?new=1`, `useOpenFromUrl` / `useOpenRequestFromUrl` in `@/lib/open-from-url`).
 * A feature adds one here (docs/ADDING-A-FEATURE.md → Quick actions). Keep it short: the everyday "add".
 */
export type QuickActionDefinition = {
  id: string;
  /** In the `common` namespace (src/locales). */
  labelKey: string;
  icon: LucideIcon;
  /** The section it opens (docs/BRANDING.md), so its icon chip has that colour. */
  accent: SectionAccent;
  to: string;
  /** The letter after "N" (N, then T = new task); unique. */
  key: string;
  /**
   * Who sees it; left out = everyone. Mirrors the target screen's rule (`canManageTasks`…: children can't
   * create there), so nobody gets a shortcut to a form that won't open.
   */
  roles?: readonly Role[];
};

const ADULTS: readonly Role[] = ["owner", "adult"];

export const QUICK_ACTIONS: readonly QuickActionDefinition[] = [
  { id: "task", labelKey: "quickActions.items.task", icon: ListPlusIcon, accent: "tasks", to: "/tasks?new=1", key: "T", roles: ADULTS },
  // Children may add to the shopping list.
  { id: "shoppingItem", labelKey: "quickActions.items.shoppingItem", icon: ShoppingCartIcon, accent: "shopping", to: "/shopping?new=1", key: "S" },
  // The fast "Log an expense" (already paid), not the full expense form.
  { id: "logExpense", labelKey: "quickActions.items.logExpense", icon: ReceiptIcon, accent: "finance", to: "/expenses?log=1", key: "E", roles: ADULTS },
  { id: "scanProduct", labelKey: "quickActions.items.scanProduct", icon: ScanBarcodeIcon, accent: "shopping", to: "/inventory/scan", key: "B", roles: ADULTS },
  { id: "recipe", labelKey: "quickActions.items.recipe", icon: ChefHatIcon, accent: "shopping", to: "/recipes?tab=all&new=1", key: "R", roles: ADULTS },
  { id: "event", labelKey: "quickActions.items.event", icon: CalendarPlusIcon, accent: "calendar", to: "/calendar?new=1", key: "C", roles: ADULTS },
  { id: "income", labelKey: "quickActions.items.income", icon: BanknoteIcon, accent: "finance", to: "/income?new=1", key: "I", roles: ADULTS },
  // The frame opens the "Ask" chat sheet in place instead (`onSelect`); `to` is the fallback.
  { id: "assistant", labelKey: "quickActions.items.assistant", icon: BotIcon, accent: "assistant", to: "/assistant", key: "A" },
];

/** The quick actions this role may use, in the list's order. */
export function quickActionsFor(role: Role, actions: readonly QuickActionDefinition[] = QUICK_ACTIONS): QuickActionDefinition[] {
  return actions.filter((action) => !action.roles || action.roles.includes(role));
}

/**
 * Ready for the shared quick-action components: translated labels, the "N, <key>" shortcut, and an
 * `onSelect` for actions the frame handles on the page itself (by id).
 */
export function toQuickActionItems(
  actions: readonly QuickActionDefinition[],
  t: (key: string) => string,
  handlers: Partial<Record<string, () => void>> = {},
): QuickActionItem[] {
  return actions.map(({ id, labelKey, icon, accent, to, key }) => ({
    id,
    label: t(labelKey),
    icon,
    accent,
    to,
    onSelect: handlers[id],
    shortcut: ["N", key],
  }));
}
