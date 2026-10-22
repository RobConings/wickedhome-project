import i18n from "i18next";
import type { ActionFunctionArgs } from "react-router";
import { failedAction, type FormResult, formString, parseForm, readIntent } from "@/lib/forms";
import { habitantInputSchema } from "../types/household";
import { createHabitant, deleteHabitant, fetchHouseholdOverview, updateHabitant } from "./household-requests";

export const HABITANT_INTENTS = ["create", "update", "delete"] as const;
export type HabitantIntent = (typeof HABITANT_INTENTS)[number];

export type HabitantActionResult = FormResult & { intent?: HabitantIntent };

export function habitantsLoader() {
  return fetchHouseholdOverview();
}

/** One action for the habitants page; the form's `intent` field says what to do. */
export async function habitantsAction({ request }: ActionFunctionArgs): Promise<HabitantActionResult> {
  const formData = await request.formData();
  const intent = readIntent<HabitantIntent>(formData);
  const id = formString(formData, "id");

  try {
    if (intent === "delete") {
      await deleteHabitant(id);
      return { ok: true, intent };
    }

    const { data, errors } = parseForm(habitantInputSchema, formData);
    if (errors) return { errors, intent: intent ?? undefined };

    if (intent === "update") await updateHabitant(id, data);
    else await createHabitant(data);
    return { ok: true, intent: intent ?? "create" };
  } catch (error) {
    return failedAction(error, intent ?? undefined, { conflict: i18n.t("household:delete.hasAccount") });
  }
}
