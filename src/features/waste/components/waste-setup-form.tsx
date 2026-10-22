import * as React from "react";
import { CheckIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "./form-field";
import { InlineAlert } from "./inline-alert";
import { cn } from "@/lib/utils";
import type { WasteActionResult } from "../data/waste-requests";
import type { WasteAddressMatch, WasteLookupInput, WasteProviderId, WasteProviderInfo } from "../types/waste";

/** Prefill for the lookup fields: the home address from the household settings. */
export type WasteAddressDefaults = Partial<Pick<WasteLookupInput, "postalCode" | "municipality" | "street" | "number" | "box">>;

type WasteSetupFormProps = {
  providers: WasteProviderInfo[];
  suggestedProviderId: WasteProviderId | null;
  /** The current provider when changing an existing setup. */
  currentProviderId?: WasteProviderId | null;
  defaults: WasteAddressDefaults;
  /** Shown when changing an existing setup. */
  onCancel?: () => void;
  /** Called once the setup is saved (and synced). */
  onSaved?: () => void;
};

/**
 * Connects the household to its collector: pick the provider (suggested from the postal code), look the
 * address up at that provider, confirm the match. Saving syncs the collection days right away.
 */
export function WasteSetupForm({
  providers,
  suggestedProviderId,
  currentProviderId,
  defaults,
  onCancel,
  onSaved,
}: WasteSetupFormProps) {
  const { t } = useTranslation("waste");
  const { t: tCommon } = useTranslation();
  const lookup = useFetcher<WasteActionResult>({ key: "waste-lookup" });
  const save = useFetcher<WasteActionResult>({ key: "waste-save" });
  const [providerId, setProviderId] = React.useState<WasteProviderId>(
    currentProviderId ?? suggestedProviderId ?? providers[0]?.id ?? "recycle-app",
  );
  const searching = lookup.state !== "idle";
  const saving = save.state !== "idle";
  const result = lookup.data?.lookup;
  const provider = providers.find((candidate) => candidate.id === providerId);
  // Results belong to the provider they were looked up at.
  const lookedUpAt = lookup.formData?.get("providerId") ?? lookup.data?.providerId;
  const matches: WasteAddressMatch[] = result && lookedUpAt === providerId ? result.matches : [];

  // The chosen match, reset to the first one whenever a new lookup comes back.
  const [choice, setChoice] = React.useState<{ for: typeof result; index: number }>({ for: undefined, index: 0 });
  const selected = choice.for === result ? choice.index : 0;
  const setSelected = (index: number) => setChoice({ for: result, index });

  const savedSetup = save.state === "idle" ? save.data : undefined;
  const handled = React.useRef<WasteActionResult | undefined>(undefined);
  React.useEffect(() => {
    if (!savedSetup || savedSetup === handled.current) return;
    handled.current = savedSetup;
    if (!savedSetup.ok || !savedSetup.setup) return;
    if (savedSetup.setup.lastSyncStatus === "error") toast.warning(t("setup.savedSyncFailed"));
    else toast.success(t("setup.saved"));
    onSaved?.();
  }, [savedSetup, onSaved, t]);

  const errors = lookup.data?.errors;
  const problem = result && lookedUpAt === providerId ? result.problem : null;

  function confirm() {
    const match = matches[selected];
    if (!match) return;
    void save.submit(
      { intent: "waste-save", providerId, label: match.label, address: JSON.stringify(match.address) },
      { method: "post" },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <lookup.Form method="post" noValidate className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="waste-lookup" />
        <fieldset disabled={searching || saving} className="flex flex-col gap-4">
          <FormField
            label={t("setup.provider")}
            htmlFor="waste-provider"
            description={provider ? <a className="underline underline-offset-2" href={provider.website} target="_blank" rel="noreferrer noopener">{provider.website.replace(/^https:\/\/(www\.)?/, "")}</a> : undefined}
          >
            <Select name="providerId" value={providerId} onValueChange={(value) => setProviderId(value as WasteProviderId)}>
              <SelectTrigger id="waste-provider" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                    {option.id === suggestedProviderId && (
                      <span className="text-muted-foreground"> · {t("setup.suggested")}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {provider && <p className="-mt-2 text-sm text-muted-foreground">{t(`providers.${provider.id}.hint`)}</p>}

          <div className="grid grid-cols-6 gap-3">
            <FormField label={t("setup.fields.street")} htmlFor="waste-street" errors={errors?.street} className="col-span-6 sm:col-span-4">
              <Input id="waste-street" name="street" defaultValue={defaults.street ?? ""} maxLength={120} autoComplete="off" />
            </FormField>
            <FormField label={t("setup.fields.number")} htmlFor="waste-number" errors={errors?.number} className="col-span-3 sm:col-span-1">
              <Input id="waste-number" name="number" defaultValue={defaults.number ?? ""} maxLength={12} autoComplete="off" />
            </FormField>
            <FormField
              label={t("setup.fields.box")}
              htmlFor="waste-box"
              optionalLabel={tCommon("form.optional")}
              className="col-span-3 sm:col-span-1"
            >
              <Input id="waste-box" name="box" defaultValue={defaults.box ?? ""} maxLength={12} autoComplete="off" />
            </FormField>
            <FormField label={t("setup.fields.postalCode")} htmlFor="waste-postal-code" errors={errors?.postalCode} className="col-span-2">
              <Input id="waste-postal-code" name="postalCode" defaultValue={defaults.postalCode ?? ""} inputMode="numeric" maxLength={4} />
            </FormField>
            <FormField
              label={t("setup.fields.municipality")}
              htmlFor="waste-municipality"
              description={providerId === "limburg-net" ? t("setup.mainMunicipality") : undefined}
              errors={errors?.municipality}
              className="col-span-4"
            >
              <Input id="waste-municipality" name="municipality" defaultValue={defaults.municipality ?? ""} maxLength={80} />
            </FormField>
          </div>
        </fieldset>
        {lookup.data?.formError && <InlineAlert tone="error">{lookup.data.formError}</InlineAlert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant={matches.length ? "outline" : "default"} loading={searching}>
            <SearchIcon />
            {searching ? t("setup.searching") : t("setup.find")}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              {tCommon("actions.cancel")}
            </Button>
          )}
        </div>
      </lookup.Form>

      {problem && <InlineAlert tone="error">{t(`setup.problems.${problem}`, { provider: provider?.name ?? "" })}</InlineAlert>}

      {matches.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{matches.length === 1 ? t("setup.foundOne") : t("setup.foundMany")}</p>
          <div role="radiogroup" aria-label={t("setup.matches")} className="flex flex-col gap-2">
            {matches.map((match, index) => (
              <button
                key={`${match.label}-${index}`}
                type="button"
                role="radio"
                aria-checked={selected === index}
                disabled={saving}
                onClick={() => setSelected(index)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected === index ? "border-primary bg-accent" : "hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border",
                    selected === index && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {selected === index && <CheckIcon className="size-3" aria-hidden="true" />}
                </span>
                {match.label}
              </button>
            ))}
          </div>
          {save.data?.formError && <InlineAlert tone="error">{save.data.formError}</InlineAlert>}
          <div>
            <Button type="button" onClick={confirm} loading={saving}>
              {saving ? t("setup.saving") : t("setup.use")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
