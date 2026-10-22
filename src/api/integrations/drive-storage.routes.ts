import { Router } from "express";
import { storageTargetKindSchema as driveStorageKindParamSchema } from "@/features/documents/types/documents";
import { driveStorageSetupSchema, driveStorageUpdateSchema } from "@/features/integrations/types/drive-storage";
import { parse } from "../lib/http";
import { currentUser, requireRole } from "../lib/session";
import {
  disableDriveStorage,
  getDriveStorageStatus,
  moveExistingToDrive,
  setupDriveStorage,
  updateDriveStorage,
} from "./drive-storage.service";

/**
 * `/api/integrations/google/drive/storage*`: Google Drive as storage for a kind of household document (bills).
 * Household-wide setting, owners and adults only; setting it up uses the signed-in person's own Drive.
 */
export const driveStorageRouter = Router();

const canManage = requireRole("owner", "adult");

driveStorageRouter.get("/google/drive/storage", canManage, async (req, res) => {
  res.json(await getDriveStorageStatus(currentUser(req)));
});

driveStorageRouter.put("/google/drive/storage/:kind", canManage, async (req, res) => {
  const kind = parse(driveStorageKindParamSchema, req.params.kind);
  res.json(await setupDriveStorage(currentUser(req), kind, parse(driveStorageSetupSchema, req.body)));
});

driveStorageRouter.patch("/google/drive/storage/:kind", canManage, async (req, res) => {
  const kind = parse(driveStorageKindParamSchema, req.params.kind);
  res.json(await updateDriveStorage(currentUser(req), kind, parse(driveStorageUpdateSchema, req.body)));
});

driveStorageRouter.delete("/google/drive/storage/:kind", canManage, async (req, res) => {
  const kind = parse(driveStorageKindParamSchema, req.params.kind);
  res.json(await disableDriveStorage(currentUser(req), kind));
});

driveStorageRouter.post("/google/drive/storage/:kind/move-existing", canManage, async (req, res) => {
  const kind = parse(driveStorageKindParamSchema, req.params.kind);
  res.json(await moveExistingToDrive(currentUser(req), kind));
});
