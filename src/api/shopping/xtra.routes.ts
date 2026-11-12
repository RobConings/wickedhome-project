import { Router, type Request, type Response } from "express";
import { xtraAccessSchema, xtraConnectSchema, xtraSearchSchema } from "@/features/shopping/types/xtra";
import { parse } from "../lib/http";
import { currentUser, requireUser } from "../lib/session";
import { checkXtra, connectXtra, disconnectXtra, searchXtra, setXtraAccess, xtraStatus } from "./xtra.service";

export const xtraRouter = Router();
xtraRouter.use(requireUser);
xtraRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
async function connectedRequest<T>(req: Request, res: Response, run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const closed = () => { if (!res.writableEnded) controller.abort(); };
  res.once("close", closed);
  try { const data = await run(controller.signal); if (!res.destroyed) res.json(data); }
  finally { res.off("close", closed); }
}
xtraRouter.get("/status", async (req, res) => { res.json(await xtraStatus(currentUser(req))); });
xtraRouter.post("/connection", async (req, res) => {
  const input = parse(xtraConnectSchema, req.body);
  await connectedRequest(req, res, (signal) => connectXtra(currentUser(req), input, signal));
});
xtraRouter.put("/access", async (req, res) => { const input = parse(xtraAccessSchema, req.body); res.json(await setXtraAccess(currentUser(req), input.userIds)); });
xtraRouter.post("/check", async (req, res) => { await connectedRequest(req, res, (signal) => checkXtra(currentUser(req), signal)); });
xtraRouter.delete("/connection", async (req, res) => { await disconnectXtra(currentUser(req)); res.status(204).end(); });
xtraRouter.get("/products", async (req, res) => { const input = parse(xtraSearchSchema, req.query); await connectedRequest(req, res, (signal) => searchXtra(currentUser(req), input, signal)); });
