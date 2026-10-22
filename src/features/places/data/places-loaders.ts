import i18n from "i18next";
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ApiRequestError } from "../lib/api-client";
import { parseForm, toFormResult, type FormResult } from "../lib/forms";
import { floorInputSchema, floorPlanInputSchema, placeInputSchema, type FloorPlan } from "../types/places";
import {
  createFloor,
  createPlace,
  createStarterFloors,
  deleteFloor,
  deletePlace,
  fetchFloorPlan,
  fetchPlaceDetail,
  fetchPlacesOverview,
  saveFloorPlan,
  updateFloor,
  updatePlace,
} from "./places-requests";

export const PLACES_INTENTS = [
  "create-floor",
  "update-floor",
  "delete-floor",
  "create-starter",
  "create-place",
  "update-place",
  "delete-place",
] as const;
export type PlacesIntent = (typeof PLACES_INTENTS)[number];

export type PlacesActionResult = FormResult & { intent?: PlacesIntent };

/** A missing floor or place (or one of another household) shows the not-found page. */
async function orNotFound<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

export function placesLoader() {
  return fetchPlacesOverview();
}

export function floorPlanLoader({ params }: LoaderFunctionArgs) {
  return orNotFound(fetchFloorPlan(params.floorId ?? ""));
}

export function placeDetailLoader({ params }: LoaderFunctionArgs) {
  return orNotFound(fetchPlaceDetail(params.placeId ?? ""));
}

/**
 * One action for everything the places pages change; the form's `intent` field says what to do.
 * Used by the overview and the place detail page (which redirects to the overview after a delete).
 */
export async function placesAction({ request }: ActionFunctionArgs): Promise<PlacesActionResult | Response> {
  const formData = await request.formData();
  const intent = formData.get("intent") as PlacesIntent | null;
  const id = String(formData.get("id") ?? "");

  try {
    switch (intent) {
      case "delete-floor":
        await deleteFloor(id);
        return { ok: true, intent };
      case "delete-place":
        await deletePlace(id);
        return formData.get("redirectTo") ? redirect(String(formData.get("redirectTo"))) : { ok: true, intent };
      case "create-starter":
        await createStarterFloors({ indoor: i18n.t("places:starter.indoor"), outdoor: i18n.t("places:starter.outdoor") });
        return { ok: true, intent };
      case "create-floor":
      case "update-floor": {
        const { data: input, errors } = parseForm(floorInputSchema, formData);
        if (errors) return { errors, intent };
        if (intent === "update-floor") await updateFloor(id, input);
        else await createFloor(input);
        return { ok: true, intent };
      }
      case "create-place":
      case "update-place": {
        const { data: input, errors } = parseForm(placeInputSchema, formData);
        if (errors) return { errors, intent };
        if (intent === "update-place") await updatePlace(id, input);
        else await createPlace(input);
        return { ok: true, intent };
      }
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    return {
      ...toFormResult(error, { conflict: i18n.t("places:floor.delete.hasPlaces") }),
      intent: intent ?? undefined,
    };
  }
}

export type FloorPlanActionResult = FormResult & { plan?: FloorPlan };

/** The editor submits its whole state as JSON (`encType: "application/json"`). */
export async function floorPlanAction({ request, params }: ActionFunctionArgs): Promise<FloorPlanActionResult> {
  const result = floorPlanInputSchema.safeParse(await request.json());
  if (!result.success) return { formError: i18n.t("places:editor.saveInvalid") };
  try {
    return { ok: true, plan: await saveFloorPlan(params.floorId ?? "", result.data) };
  } catch (error) {
    const { errors: _errors, ...rest } = toFormResult(error);
    return { formError: rest.formError ?? i18n.t("places:editor.saveInvalid") };
  }
}
