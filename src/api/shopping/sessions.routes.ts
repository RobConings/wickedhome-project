import { shoppingPaymentSchema } from "@/features/expenses/types/shopping-payment";
import {
  getShoppingFinanceOptions,
  recordShoppingPayment,
  shoppingSessionsForExpense,
} from "./session-payments.service";
import { Router } from "express";
import { z } from "zod";
import { idSchema } from "@/types/common";
import {
  receiptAttachSchema,
  receiptLineSchema,
  sessionAddItemSchema,
  sessionCreateSchema,
  sessionItemUpdateSchema,
} from "@/features/shopping/types/sessions";
import { currentUser, requireUser } from "../lib/session";
import { parse } from "../lib/http";
import {
  addShoppingSessionItem,
  attachShoppingReceipt,
  closeShoppingSession,
  createShoppingSession,
  deleteShoppingSession,
  getShoppingSession,
  joinShoppingSession,
  listShoppingSessions,
  shoppingSessionCoverage,
  planShoppingVisit,
  reconcileShoppingReceiptLine,
  updateShoppingSessionItem,
} from "./sessions.service";
export const shoppingSessionsRouter = Router();
shoppingSessionsRouter.use(requireUser);
const id = (value: unknown) => parse(idSchema, value);
shoppingSessionsRouter.get("/", async (req, res) => {
  res.json(await listShoppingSessions(currentUser(req)));
});
shoppingSessionsRouter.get("/coverage", async (req, res) => { res.setHeader("Cache-Control", "no-store"); res.json(await shoppingSessionCoverage(currentUser(req))); });
shoppingSessionsRouter.post("/plan", async (req, res) => {
  res.json(await planShoppingVisit(currentUser(req)));
});
shoppingSessionsRouter.post("/", async (req, res) => {
  res
    .status(201)
    .json(
      await createShoppingSession(
        currentUser(req),
        parse(sessionCreateSchema, req.body),
      ),
    );
});
shoppingSessionsRouter.get("/:id", async (req, res) => {
  res.json(await getShoppingSession(currentUser(req), id(req.params.id)));
});
shoppingSessionsRouter.post("/:id/join", async (req, res) => {
  res.json(await joinShoppingSession(currentUser(req), id(req.params.id)));
});
shoppingSessionsRouter.post("/:id/delete", async (req, res) => {
  res.json(await deleteShoppingSession(currentUser(req), id(req.params.id),
    parse(z.object({ revision: z.number().int().min(0) }), req.body).revision));
});
shoppingSessionsRouter.post("/:id/close", async (req, res) => {
  res.json(
    await closeShoppingSession(
      currentUser(req),
      id(req.params.id),
      parse(z.object({ revision: z.number().int().min(0) }), req.body).revision,
    ),
  );
});
shoppingSessionsRouter.post("/:id/items", async (req, res) => {
  res
    .status(201)
    .json(
      await addShoppingSessionItem(
        currentUser(req),
        id(req.params.id),
        parse(sessionAddItemSchema, req.body),
      ),
    );
});
shoppingSessionsRouter.patch("/:id/items/:itemId", async (req, res) => {
  res.json(
    await updateShoppingSessionItem(
      currentUser(req),
      id(req.params.id),
      id(req.params.itemId),
      parse(sessionItemUpdateSchema, req.body),
    ),
  );
});
shoppingSessionsRouter.post("/:id/receipts", async (req, res) => {
  res.json(
    await attachShoppingReceipt(
      currentUser(req),
      id(req.params.id),
      parse(receiptAttachSchema, req.body),
    ),
  );
});
shoppingSessionsRouter.post(
  "/:id/receipts/:receiptId/lines",
  async (req, res) => {
    res.json(
      await reconcileShoppingReceiptLine(
        currentUser(req),
        id(req.params.id),
        id(req.params.receiptId),
        parse(receiptLineSchema, req.body),
      ),
    );
  },
);

shoppingSessionsRouter.get("/:id/finance-options", async (req, res) => {
  res.json(await getShoppingFinanceOptions(currentUser(req)));
});
shoppingSessionsRouter.post("/:id/payments", async (req, res) => {
  res.json(
    await recordShoppingPayment(
      currentUser(req),
      id(req.params.id),
      parse(shoppingPaymentSchema, req.body),
    ),
  );
});
shoppingSessionsRouter.get("/for-expense/:expenseId", async (req, res) => {
  res.json(
    await shoppingSessionsForExpense(
      currentUser(req),
      id(req.params.expenseId),
    ),
  );
});
