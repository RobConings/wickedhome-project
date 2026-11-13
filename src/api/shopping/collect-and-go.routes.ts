import { Router, type Request, type Response } from "express";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { adoptCollectAndGoSession, disconnectCollectAndGoBrowser, importCollectAndGoSession, readCollectAndGoCart, readCollectAndGoActivity, readCollectAndGoOrders, readCollectAndGoOrder, setCollectAndGoAccess } from "./collect-and-go-browser";
import { collectAndGoStatus } from "./collect-and-go-connection";
import { collectAndGoAccessSchema, collectAndGoConnectionInputSchema, collectAndGoOrderIdSchema } from "@/features/shopping/types/collect-and-go";
import { parse } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
const changes = createRateLimiter({ limit: 20, windowMs: 60000 });
export const collectAndGoRouter = Router();
collectAndGoRouter.use(requireUser);
collectAndGoRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
collectAndGoRouter.get("/status", async (req, res) => { res.json(await collectAndGoStatus(currentUser(req))); });
async function cartRequest(req: Request, res: Response, checking = false) {
  const user = currentUser(req); changes.hit(user.id);
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", abort);
  try {
    const cart = await readCollectAndGoCart(user, controller.signal, checking);
    res.json(checking ? { cart, status: await collectAndGoStatus(user) } : cart);
  } finally { res.off("close", abort); }
}
collectAndGoRouter.get("/cart", (req, res) => cartRequest(req, res));
collectAndGoRouter.post("/check", (req, res) => cartRequest(req, res, true));
async function orderRequest(req: Request, res: Response, id?: string, activity = false) {
  const user = currentUser(req); changes.hit(user.id);
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", abort);
  try { res.json(activity ? await readCollectAndGoActivity(user, controller.signal) : id ? await readCollectAndGoOrder(user, id, controller.signal) : await readCollectAndGoOrders(user, controller.signal)); }
  finally { res.off("close", abort); }
}
collectAndGoRouter.get("/activity", (req, res) => orderRequest(req, res, undefined, true));
collectAndGoRouter.get("/orders", (req, res) => orderRequest(req, res));
collectAndGoRouter.get("/orders/:id", (req, res) => orderRequest(req, res, parse(collectAndGoOrderIdSchema, req.params.id)));
collectAndGoRouter.use(requireRole("owner"));
collectAndGoRouter.post("/session", async (req, res) => {
  const user = currentUser(req); changes.hit(user.id);
  res.json(await importCollectAndGoSession(user, parse(collectAndGoConnectionInputSchema, req.body)));
});
collectAndGoRouter.put("/access", async (req, res) => {
  const user = currentUser(req); changes.hit(user.id);
  res.json(await setCollectAndGoAccess(user, parse(collectAndGoAccessSchema, req.body).userIds));
});
collectAndGoRouter.post("/session/adopt", async (req, res) => {
  const user = currentUser(req); changes.hit(user.id);
  res.json(await adoptCollectAndGoSession(user, parse(collectAndGoAccessSchema, req.body).userIds));
});
collectAndGoRouter.delete("/session", async (req, res) => { const user = currentUser(req); changes.hit(user.id); await disconnectCollectAndGoBrowser(user); res.status(204).end(); });
