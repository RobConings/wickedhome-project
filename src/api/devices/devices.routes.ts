import { Router } from "express";
import { z } from "zod";
import { listDevicePresets } from "@/features/devices/types/device-presets";
import {
  deviceBindingsInputSchema,
  deviceInputSchema,
  devicePositionInputSchema,
  deviceProfileInputSchema,
  deviceValueInputSchema,
  fieldKeySchema,
} from "@/features/devices/types/devices";
import { idSchema, localeSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  createDevice,
  createProfile,
  createProfileFromPreset,
  deleteDevice,
  deleteProfile,
  getDeviceDetail,
  getDevicesOverview,
  getProfile,
  listProfiles,
  setDeviceBindings,
  setDevicePosition,
  setDeviceValue,
  updateDevice,
  updateProfile,
} from "./devices.service";

export const devicesRouter = Router();

devicesRouter.use(requireUser);

/** Adults and owners change devices and set manual values; children only look. */
const canManage = requireRole("owner", "adult");

const presetBodySchema = z.object({ locale: localeSchema.optional() });

/** Every device and profile, for the list, the live house view and the plan editor. */
devicesRouter.get("/", async (req, res) => {
  res.json(await getDevicesOverview(currentUser(req).householdId));
});

// Presets -------------------------------------------------------------------------------------------------

devicesRouter.get("/presets", (req, res) => {
  res.json(listDevicePresets(currentUser(req).locale));
});

/** Creates an editable profile from a preset, in the user's language (or `locale`). */
devicesRouter.post("/presets/:key", canManage, async (req, res) => {
  const key = parse(z.string().min(1).max(40), req.params.key);
  const { locale } = parse(presetBodySchema, req.body ?? {});
  const user = currentUser(req);
  res.status(201).json(await createProfileFromPreset(user.householdId, key, locale ?? user.locale));
});

// Profiles ------------------------------------------------------------------------------------------------

devicesRouter.get("/profiles", async (req, res) => {
  res.json(await listProfiles(currentUser(req).householdId));
});

devicesRouter.post("/profiles", canManage, async (req, res) => {
  const input = parse(deviceProfileInputSchema, req.body);
  res.status(201).json(await createProfile(currentUser(req).householdId, input));
});

devicesRouter.get("/profiles/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getProfile(currentUser(req).householdId, id));
});

devicesRouter.put("/profiles/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(deviceProfileInputSchema, req.body);
  res.json(await updateProfile(currentUser(req).householdId, id, input));
});

devicesRouter.delete("/profiles/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteProfile(currentUser(req).householdId, id);
  res.status(204).end();
});

// Devices -------------------------------------------------------------------------------------------------

devicesRouter.post("/", canManage, async (req, res) => {
  const input = parse(deviceInputSchema, req.body);
  res.status(201).json(await createDevice(currentUser(req).householdId, input));
});

devicesRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getDeviceDetail(currentUser(req).householdId, id));
});

devicesRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(deviceInputSchema, req.body);
  res.json(await updateDevice(currentUser(req).householdId, id, input));
});

devicesRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteDevice(currentUser(req).householdId, id);
  res.status(204).end();
});

/** Place on (or take off) a floor plan. */
devicesRouter.put("/:id/position", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(devicePositionInputSchema, req.body);
  res.json(await setDevicePosition(currentUser(req).householdId, id, input));
});

/** Where each field's value comes from (manual or a Home Assistant entity). */
devicesRouter.put("/:id/bindings", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(deviceBindingsInputSchema, req.body);
  res.json(await setDeviceBindings(currentUser(req).householdId, id, input));
});

/** Sets a manual value; publishes `device.value` on the live event stream. */
devicesRouter.put("/:id/values/:fieldKey", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const fieldKey = parse(fieldKeySchema, req.params.fieldKey);
  const { value } = parse(deviceValueInputSchema, req.body);
  res.json(await setDeviceValue(currentUser(req).householdId, id, fieldKey, value));
});
