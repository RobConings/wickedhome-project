import i18n from "i18next";
import { api } from "../lib/api-client";
import { parseForm, toFormResult, type FormResult } from "../lib/forms";
import {
  wasteLookupInputSchema,
  wasteSetupInputSchema,
  wasteTaskSettingsInputSchema,
  type WasteDay,
  type WasteLookupInput,
  type WasteLookupResult,
  type WasteProviderId,
  type WasteSettings,
  type WasteSetup,
  type WasteSetupInput,
  type WasteSummary,
  type WasteTaskSettingsInput,
} from "../types/waste";

export const fetchWasteSettings = () => api.get<WasteSettings>("/waste/settings");
export const fetchWasteSummary = () => api.get<WasteSummary>("/waste/summary");
export const fetchWasteCollections = (from: string, to: string) =>
  api.get<WasteDay[]>(`/waste/collections?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const lookupWasteAddress = (input: WasteLookupInput) => api.post<WasteLookupResult>("/waste/lookup", input);
export const saveWasteSetup = (input: WasteSetupInput) => api.put<WasteSetup>("/waste/setup", input);
export const deleteWasteSetup = () => api.delete("/waste/setup");
export const syncWasteNow = () => api.post<WasteSetup>("/waste/sync");
export const saveWasteTaskSettings = (input: WasteTaskSettingsInput) => api.put<WasteSetup>("/waste/task-settings", input);

/** Intents of the waste settings forms, handled by `submitWasteSettings` in the hosting route's action. */
export const WASTE_INTENTS = ["waste-lookup", "waste-save", "waste-sync", "waste-remove", "waste-tasks"] as const;
export type WasteIntent = (typeof WASTE_INTENTS)[number];

export const isWasteIntent = (intent: unknown): intent is WasteIntent =>
  typeof intent === "string" && (WASTE_INTENTS as readonly string[]).includes(intent);

export type WasteActionResult = FormResult & {
  intent: WasteIntent;
  lookup?: WasteLookupResult;
  /** The provider a lookup ran against. */
  providerId?: WasteProviderId;
  setup?: WasteSetup;
};

/** Runs one waste settings form submission. Call it from the hosting route's action (Settings). */
export async function submitWasteSettings(intent: WasteIntent, formData: FormData): Promise<WasteActionResult> {
  try {
    switch (intent) {
      case "waste-lookup": {
        const { data, errors } = parseForm(wasteLookupInputSchema, formData);
        if (errors) return { errors, intent };
        return { ok: true, intent, providerId: data.providerId, lookup: await lookupWasteAddress(data) };
      }
      case "waste-save": {
        let address: unknown = null;
        try {
          address = JSON.parse(String(formData.get("address") ?? "null"));
        } catch {
          // Validated below.
        }
        const parsed = wasteSetupInputSchema.safeParse({
          providerId: formData.get("providerId"),
          label: formData.get("label"),
          address,
        });
        if (!parsed.success) return { formError: i18n.t("waste:setup.invalidMatch"), intent };
        return { ok: true, intent, setup: await saveWasteSetup(parsed.data) };
      }
      case "waste-sync":
        return { ok: true, intent, setup: await syncWasteNow() };
      case "waste-remove":
        await deleteWasteSetup();
        return { ok: true, intent };
      case "waste-tasks": {
        const parsed = wasteTaskSettingsInputSchema.safeParse({
          enabled: formData.get("enabled") === "true",
          timing: formData.get("timing"),
          assigneeIds: formData.getAll("assigneeIds").map(String).filter(Boolean),
          rotate: formData.get("rotate") === "true",
        });
        if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
        return { ok: true, intent, setup: await saveWasteTaskSettings(parsed.data) };
      }
    }
  } catch (error) {
    return { ...toFormResult(error, { too_many_requests: i18n.t("waste:sync.tooSoon") }), intent };
  }
}
