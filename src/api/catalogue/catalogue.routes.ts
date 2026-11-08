import { Router } from "express";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireUser } from "../lib/session";
import { getProductContext } from "./catalogue.service";
export const catalogueRouter = Router();
catalogueRouter.use(requireUser);
catalogueRouter.get("/products/:id/context", async (req, res) => res.json(await getProductContext(currentUser(req).householdId, parse(idSchema, req.params.id))));
