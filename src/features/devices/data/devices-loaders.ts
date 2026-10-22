import i18n from "i18next";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { failedAction, formDataToObject, type FormResult, parseForm } from "@/lib/forms";
import { orNotFound, revalidateUnlessOnly } from "@/lib/loaders";
import { fetchAppliances, type Appliance } from "@/features/energy";
import { fetchFloorPlan, fetchPlaces, fetchPlacesOverview, type FloorPlan, type Place } from "@/features/places";
import {
  deviceBindingsInputSchema,
  deviceInputSchema,
  devicePositionInputSchema,
  deviceProfileInputSchema,
  fieldValueSchema,
  type DeviceProfile,
  type DevicesOverview,
} from "../types/devices";
import {
  createDevice,
  createDeviceProfile,
  createProfileFromPreset,
  deleteDevice,
  deleteDeviceProfile,
  fetchDeviceDetail,
  fetchDevicePresets,
  fetchDeviceProfile,
  fetchDeviceProfiles,
  fetchDevicesOverview,
  setDeviceValue,
  updateDevice,
  updateDeviceBindings,
  updateDevicePosition,
  updateDeviceProfile,
} from "./devices-requests";

export type DevicesActionResult = FormResult & { intent?: string };


// Other features are optional: devices still work when there are no places or appliances yet.
const placesOrEmpty = () => fetchPlaces().catch((): Place[] => []);
const appliancesOrEmpty = () => fetchAppliances().catch((): Appliance[] => []);
const emptyOverview = (): DevicesOverview => ({ devices: [], profiles: [] });

export async function devicesLoader() {
  const [overview, places, appliances] = await Promise.all([fetchDevicesOverview(), placesOrEmpty(), appliancesOrEmpty()]);
  return { ...overview, places, appliances };
}
export type DevicesData = Awaited<ReturnType<typeof devicesLoader>>;

export async function deviceDetailLoader({ params }: LoaderFunctionArgs) {
  const [detail, profiles, places, appliances] = await Promise.all([
    orNotFound(fetchDeviceDetail(params.deviceId ?? "")),
    fetchDeviceProfiles(),
    placesOrEmpty(),
    appliancesOrEmpty(),
  ]);
  return { ...detail, profiles, places, appliances };
}
export type DeviceDetailData = Awaited<ReturnType<typeof deviceDetailLoader>>;

/** The live house view: every floor plan with every device. */
export async function houseLoader() {
  const [overview, devices] = await Promise.all([
    fetchPlacesOverview().catch(() => ({ floors: [], places: [] })),
    fetchDevicesOverview().catch(emptyOverview),
  ]);
  const plans: FloorPlan[] = await Promise.all(overview.floors.map((floor) => fetchFloorPlan(floor.id)));
  return { plans, ...devices };
}
export type HouseData = Awaited<ReturnType<typeof houseLoader>>;

/** Switching floor tabs (`?floor=`) is client-side only: don't reload every plan for it. */
export const houseShouldRevalidate = revalidateUnlessOnly(["floor"]);

export async function deviceProfilesLoader() {
  const [profiles, presets] = await Promise.all([fetchDeviceProfiles(), fetchDevicePresets()]);
  return { profiles, presets };
}
export type DeviceProfilesData = Awaited<ReturnType<typeof deviceProfilesLoader>>;

/** `/devices/profiles/new` opens an empty editor; any other id loads that profile. */
export async function deviceProfileLoader({ params }: LoaderFunctionArgs): Promise<{ profile: DeviceProfile | null }> {
  const id = params.profileId ?? "";
  if (id === "new") return { profile: null };
  return { profile: await orNotFound(fetchDeviceProfile(id)) };
}

/** Form posts and JSON submissions (`encType: "application/json"`) both arrive here as a plain object. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.includes("application/json")) return (await request.json()) as Record<string, unknown>;
  return formDataToObject(await request.formData());
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * One action for the device pages (list, detail, live house view); `intent` says what to do:
 * save · delete · set-value · set-position · save-bindings.
 */
export async function devicesAction({ request }: ActionFunctionArgs): Promise<DevicesActionResult | Response> {
  const body = await readBody(request);
  const intent = text(body.intent) || "save";
  const id = text(body.id) || text(body.deviceId);

  try {
    switch (intent) {
      case "save": {
        const formData = new FormData();
        for (const [key, value] of Object.entries(body)) if (typeof value === "string") formData.set(key, value);
        const { data: input, errors } = parseForm(deviceInputSchema, formData);
        if (errors) return { errors, intent };
        if (id) await updateDevice(id, { ...input, placeId: input.placeId ?? null, applianceId: input.applianceId ?? null });
        else await createDevice(input);
        return { ok: true, intent };
      }
      case "delete":
        await deleteDevice(id);
        return body.redirectTo ? redirect(text(body.redirectTo)) : { ok: true, intent };
      case "set-value": {
        // Form posts send the value as JSON text ("true", "21.5", "\"armed_home\"", "null").
        const raw = typeof body.value === "string" ? safeJson(body.value) : body.value;
        const value = fieldValueSchema.safeParse(raw ?? null);
        if (!value.success) return { formError: i18n.t("devices:values.invalid"), intent };
        await setDeviceValue(id, text(body.fieldKey), value.data);
        return { ok: true, intent };
      }
      case "set-position": {
        const position = devicePositionInputSchema.safeParse(body.position ?? { floorId: null, x: null, y: null });
        if (!position.success) return { formError: i18n.t("common:errors.generic"), intent };
        await updateDevicePosition(id, position.data);
        return { ok: true, intent };
      }
      case "save-bindings": {
        const bindings = deviceBindingsInputSchema.safeParse({ bindings: body.bindings });
        if (!bindings.success) return { formError: i18n.t("devices:bindings.invalid"), intent };
        await updateDeviceBindings(id, bindings.data);
        return { ok: true, intent };
      }
      default:
        return { formError: i18n.t("common:errors.generic"), intent };
    }
  } catch (error) {
    return failedAction(error, intent, { conflict: i18n.t("devices:values.fromHomeAssistant") });
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Profiles page: add from a preset (then open the editor) or delete. */
export async function deviceProfilesAction({ request }: ActionFunctionArgs): Promise<DevicesActionResult | Response> {
  const body = await readBody(request);
  const intent = text(body.intent);
  try {
    if (intent === "add-preset") {
      const profile = await createProfileFromPreset(text(body.key));
      return redirect(`/devices/profiles/${profile.id}`);
    }
    if (intent === "delete") {
      await deleteDeviceProfile(text(body.id));
      return { ok: true, intent };
    }
    return { formError: i18n.t("common:errors.generic"), intent };
  } catch (error) {
    return failedAction(error, intent, { conflict: i18n.t("devices:profiles.delete.inUse") });
  }
}

/** Profile editor: the whole profile arrives as JSON. */
export async function deviceProfileAction({ request, params }: ActionFunctionArgs): Promise<DevicesActionResult | Response> {
  const body = await readBody(request);
  const intent = text(body.intent) || "save";
  const id = params.profileId ?? "new";
  try {
    if (intent === "delete") {
      await deleteDeviceProfile(id);
      return redirect("/devices/profiles");
    }
    const parsed = deviceProfileInputSchema.safeParse(body.profile);
    if (!parsed.success) return { formError: i18n.t("devices:editor.invalid"), intent };
    if (id === "new") {
      const created = await createDeviceProfile(parsed.data);
      return redirect(`/devices/profiles/${created.id}`);
    }
    await updateDeviceProfile(id, parsed.data);
    return { ok: true, intent };
  } catch (error) {
    return failedAction(error, intent, { conflict: i18n.t("devices:profiles.delete.inUse") });
  }
}
