import { shoppingPaymentSchema } from "@/features/expenses/types/shopping-payment";
import {
  getShoppingFinanceOptions,
  recordShoppingPayment,
} from "@/api/shopping/session-payments.service";
import { z } from "zod";
import { idSchema } from "@/types/common";
import {
  receiptAttachSchema,
  receiptLineSchema,
  sessionAddItemSchema,
  sessionCreateSchema,
  sessionItemUpdateSchema,
} from "@/features/shopping/types/sessions";
import {
  addShoppingSessionItem,
  attachShoppingReceipt,
  closeShoppingSession,
  createShoppingSession,
  getShoppingSession,
  joinShoppingSession,
  listShoppingSessions,
  planShoppingVisit,
  reconcileShoppingReceiptLine,
  updateShoppingSessionItem,
} from "@/api/shopping/sessions.service";
import { registerAssistantTool } from "@ai/core/kit";
const activity = {
  en: "Updated shopping visit",
  nl: "Winkelsessie bijgewerkt",
};
const adults = ["owner", "adult"] as const;
const everyone = ["owner", "adult", "child"] as const;
registerAssistantTool({
  name: "shopping.sessions",
  description:
    "List active and past shopping visits, independent of general shopping requirements.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity,
  roles: everyone,
  run: (ctx) => listShoppingSessions(ctx.user),
});
registerAssistantTool({
  name: "shopping.session",
  description:
    "Read a shopping visit with item ids/revisions, bought quantities, participants, receipts, acquisitions and known stock locations. stockNeed out (Op) means below minimum or essential at minimum; nearly_out (Bijna op) means nonessential at minimum. Forecast, not zero stock. Read before writing; a conflict requires a fresh read. Item revision is distinct from session revision (used for closing). stockAdded false means goods were logged without changing tracked stock; report that accurately.",
  input: z.object({ sessionId: idSchema }),
  permission: "read",
  confirm: "never",
  activity,
  roles: everyone,
  run: (ctx, input) => getShoppingSession(ctx.user, input.sessionId),
});
registerAssistantTool({
  name: "shopping.plan_visit",
  description:
    "Recheck needs for a NEW planning cycle. Restarts automatic replenishment evaluation without changing stock/minima or existing visit selections. Then explicitly select requirementIds for shopping_start_session.",
  input: z.object({}),
  permission: "write",
  confirm: "first-time",
  activity,
  roles: adults,
  run: (ctx) => planShoppingVisit(ctx.user),
});
registerAssistantTool({
  name: "shopping.start_session",
  description:
    "Start a visit with only explicitly selected requirementIds; an empty selection starts an empty visit. Shops or a saved shop group. Never silently add every below-minimum product. Reuse operationId and unchanged payload when retrying; includeLowStock false removes automatic contributions.",
  input: sessionCreateSchema,
  permission: "write",
  confirm: "always",
  activity,
  roles: adults,
  run: (ctx, input) => createShoppingSession(ctx.user, input),
});
registerAssistantTool({
  name: "shopping.join_session",
  description:
    "Join an active household visit. Other participants and browsers see the same committed data.",
  input: z.object({ sessionId: idSchema }),
  permission: "write",
  confirm: "first-time",
  activity,
  roles: everyone,
  run: (ctx, input) => joinShoppingSession(ctx.user, input.sessionId),
});
registerAssistantTool({
  name: "shopping.session_add_item",
  description:
    "Add a selected requirement, catalogue product or one-off to a visit. Duplicate product additions reuse its existing row. Name does not imply a product identity/category. Omit unit to use the known household stock unit; 1 potje needs no gram weight.",
  input: sessionAddItemSchema.safeExtend({ sessionId: idSchema }),
  permission: "write",
  confirm: "first-time",
  activity,
  roles: everyone,
  run: (ctx, input) => addShoppingSessionItem(ctx.user, input.sessionId, input),
});
registerAssistantTool({
  name: "shopping.session_update_item",
  description:
    "Update one visit item using its latest revision. operationId is a stable unique action id reused on retry. purchasedQuantity is TOTAL actually bought, including earlier partial purchases, in the item's unit. Bought goods credit known stock once; skipped/remove never credit stock. Unticking never removes real goods. Specify stockItemId if locations are ambiguous. Normal full buy: status bought with purchasedQuantity omitted. For 1 bought earlier + 1 now, purchasedQuantity is 2. No gram weight is required for household counts.",
  input: sessionItemUpdateSchema.extend({
    sessionId: idSchema,
    itemId: idSchema,
  }),
  permission: "write",
  confirm: "first-time",
  activity,
  roles: everyone,
  run: (ctx, input) =>
    updateShoppingSessionItem(ctx.user, input.sessionId, input.itemId, input),
});
registerAssistantTool({
  name: "shopping.close_session",
  description:
    "Close a visit after every item is bought, skipped or removed. Uses current session revision. Closing never buys missing products or creates expenses.",
  input: z.object({ sessionId: idSchema, revision: z.number().int().min(0) }),
  permission: "write",
  confirm: "always",
  activity,
  roles: adults,
  run: (ctx, input) =>
    closeShoppingSession(ctx.user, input.sessionId, input.revision),
});
registerAssistantTool({
  name: "shopping.session_attach_receipt",
  description:
    "Attach an uploaded receipt document to the visit purchase, even after closing. Give actual printed purchase date. Identical document content is detected across uploads; attaching never adds stock or expenses.",
  input: receiptAttachSchema.extend({ sessionId: idSchema }),
  permission: "write",
  confirm: "first-time",
  activity,
  roles: adults,
  run: (ctx, input) => attachShoppingReceipt(ctx.user, input.sessionId, input),
});
registerAssistantTool({
  name: "shopping.session_match_receipt",
  description:
    "Match a printed receipt line to a visit item. Quantities use its known unit. Later receipt evidence reuses earlier bought goods without another stock change. Add missing products to the visit first. Report quantity discrepancies and ask before acceptDifference; never assume extra goods. Stable printed reference/content hash prevents double import.",
  input: receiptLineSchema.extend({ sessionId: idSchema, receiptId: idSchema }),
  permission: "write",
  confirm: "always",
  activity,
  roles: adults,
  run: (ctx, input) =>
    reconcileShoppingReceiptLine(
      ctx.user,
      input.sessionId,
      input.receiptId,
      input,
    ),
});

registerAssistantTool({
  name: "shopping.payment_options",
  description:
    "Read recent paid expenses, active payment accounts and household payers with ids for shopping_session_record_payment. Match the person's named account/payer, reuse existing expenses, and ask only if their choice is ambiguous. Does not change data. Adults only.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Read shopping payment options", nl: "Betaalopties bekeken" },
  roles: adults,
  run: (ctx) => getShoppingFinanceOptions(ctx.user),
});

registerAssistantTool({
  name: "shopping.session_record_payment",
  description:
    "Link an existing paid expenseId or atomically create a one-off paid expense for this visit. receiptId links a specific receipt. reference identifies ONE payment (card-1, vouchers-1); reuse on retries. Multiple references support split payments. Existing expense payer/share validation applies. Give paymentAccountId and paidByHabitantId when known. Use shopping_payment_options to resolve existing expense, payment account and payer ids; never ask the person to supply internal ids; never also expenses_log the same payment. Never infer paid totals from stock or create an expense merely by attaching a receipt.",
  input: shoppingPaymentSchema.safeExtend({ sessionId: idSchema }),
  permission: "write",
  confirm: "always",
  activity,
  roles: adults,
  run: (ctx, input) => recordShoppingPayment(ctx.user, input.sessionId, input),
});
