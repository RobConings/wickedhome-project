import i18n from "i18next";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
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
  const intent = formData.get("intent") as HabitantIntent | null;
  const id = String(formData.get("id") ?? "");

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
    return {
      ...toFormResult(error, { conflict: i18n.t("household:delete.hasAccount") }),
      intent: intent ?? undefined,
    };
  }
}

export async function habitantDetailLoader({ params }: LoaderFunctionArgs) {
  const overview = await fetchHouseholdOverview();
  const habitant = overview.habitants.find((row) => row.id === params.habitantId);
  if (!habitant) throw new Response(null, { status: 404 });
  return { habitant, household: overview.household };
}
export async function habitantDetailAction(args: ActionFunctionArgs) {
  const result = await habitantsAction(args);
  return result.ok && result.intent === "delete" ? redirect("/habitants") : result;
}
