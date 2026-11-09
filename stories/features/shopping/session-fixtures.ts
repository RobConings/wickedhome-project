import type { SessionView, ShoppingFinanceOptions } from "@/features/shopping/types/sessions";
import { productFixtures } from "./fixtures";
const milk = productFixtures.milk;
export const sessionFixture: SessionView = { id: "session", name: "Weekly groceries", status: "active", startedAt: "2026-11-07T10:00:00Z", closedAt: null, shopIds: [], revision: 0,
  items: [{ id: "milk", productId: milk.id, name: milk.name, category: milk.category, quantity: 2, purchasedQuantity: 0, unit: "carton", status: "open", revision: 0, stockItemId: null, requirementIds: [], stockNeed: "out", stockStatus: "below_minimum", isEssential: true }],
  participants: [{ userId: "rob", name: "Rob" }], availableAcquisitions: [], stockOptions: [], purchases: [{ id: "purchase", shopId: null, purchasedAt: "2026-11-07T10:00:00Z", totalCents: 4500, receipts: [], payments: [], lines: [] }],
};
export const paymentOptionsFixture: ShoppingFinanceOptions = { accounts: [{ id: "joint", name: "Joint account" }], habitants: [{ id: "rob", name: "Rob" }], expenses: [{ id: "expense", payee: "Colruyt", amountCents: 4500, paidOn: "2026-11-07" }] };
