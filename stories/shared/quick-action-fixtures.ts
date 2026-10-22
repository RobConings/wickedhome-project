import { BanknoteIcon, BotIcon, CalendarPlusIcon, ListPlusIcon, ReceiptIcon, ScanBarcodeIcon, ShoppingCartIcon } from "lucide-react";
import type { QuickActionItem } from "@/components/shared/quick-actions";

/** Example quick actions for the QuickActions and CommandPalette stories (the app's real list is src/app/quick-actions.ts). */
export const quickActionFixtures: QuickActionItem[] = [
  { id: "task", label: "New task", icon: ListPlusIcon, accent: "tasks", to: "/tasks?new=1", shortcut: ["N", "T"] },
  { id: "shoppingItem", label: "Add shopping item", icon: ShoppingCartIcon, accent: "shopping", to: "/shopping?new=1", shortcut: ["N", "S"] },
  { id: "logExpense", label: "Log an expense", icon: ReceiptIcon, accent: "finance", to: "/expenses?log=1", shortcut: ["N", "E"] },
  { id: "scanProduct", label: "Scan product", icon: ScanBarcodeIcon, accent: "shopping", to: "/inventory/scan", shortcut: ["N", "B"] },
  { id: "event", label: "New event", icon: CalendarPlusIcon, accent: "calendar", to: "/calendar?new=1", shortcut: ["N", "C"] },
  { id: "income", label: "Record income", icon: BanknoteIcon, accent: "finance", to: "/income?new=1", shortcut: ["N", "I"] },
  { id: "assistant", label: "Ask the assistant", icon: BotIcon, accent: "assistant", to: "/assistant", shortcut: ["N", "A"], onSelect: () => {} },
];

/** What a child sees: only the shopping list and the assistant. */
export const childQuickActionFixtures = quickActionFixtures.filter((action) => action.id === "shoppingItem" || action.id === "assistant");
