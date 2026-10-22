import * as React from "react";
import { ExternalLinkIcon, MapPinIcon, MapPinOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardFooter } from "./card";
import { FormField } from "./form-field";
import { IconChip } from "./icon-chip";
import { InlineAlert } from "./inline-alert";
import { SegmentedControl } from "./segmented-control";
import { intlLocale } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { HOUSEHOLD_SETTINGS_INTENT, type HouseholdSettingsActionResult } from "../data/household-settings-requests";
import {
  HOUSEHOLD_SETTINGS_ERROR_CODES,
  mapUrl,
  type HouseholdSettings,
  type LocationMode,
} from "../types/household-settings";

type HouseholdSettingsFormProps = {
  settings: HouseholdSettings;
  /** Children see the settings but can't change them. */
  canManage: boolean;
};

/**
 * The household's name and home address. On save the server looks up the coordinates (Geopunt, else
 * OpenStreetMap); the result is shown with a map link so the owner can check it, and coordinates can
 * also be entered by hand.
 */
export function HouseholdSettingsForm({ settings, canManage }: HouseholdSettingsFormProps) {
  const { t } = useTranslation("household");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<HouseholdSettingsActionResult>({ key: HOUSEHOLD_SETTINGS_INTENT });
  const result = fetcher.data;
  const busy = fetcher.state !== "idle";
  const locale = currentLocale();
  const [mode, setMode] = React.useState<LocationMode>(settings.location?.source === "manual" ? "manual" : "auto");

  // One toast per completed save, worded after what happened to the coordinates.
  const lastResult = React.useRef<HouseholdSettingsActionResult | undefined>(undefined);
  React.useEffect(() => {
    if (fetcher.state !== "idle" || !result || result === lastResult.current) return;
    lastResult.current = result;
    if (!result.ok) return;
    if (result.geocode === "not_found" || result.geocode === "failed") toast.warning(t(`settings.geocode.${result.geocode}`));
    else toast.success(t(result.geocode === "found" ? "settings.geocode.found" : "settings.saved"));
  }, [fetcher.state, result, t]);

  const errors = (field: string) =>
    result?.errors?.[field]?.map((message) =>
      (HOUSEHOLD_SETTINGS_ERROR_CODES as readonly string[]).includes(message) ? t(`settings.errors.${message}`) : message,
    );
  const coordinate = (value: number | undefined) =>
    value === undefined ? "" : new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 6, useGrouping: false }).format(value);
  const address = settings.address;
  const location = settings.location;

  return (
    <Card id="household-settings">
      <fetcher.Form method="post" noValidate className="flex flex-col gap-5">
        <input type="hidden" name="intent" value={HOUSEHOLD_SETTINGS_INTENT} />
        <fieldset disabled={busy || !canManage} className="flex flex-col gap-5">
          {result?.formError && <InlineAlert tone="error">{result.formError}</InlineAlert>}

          <FormField label={t("settings.fields.name")} htmlFor="household-name" errors={errors("name")}>
            <Input id="household-name" name="name" defaultValue={settings.name} required maxLength={80} autoComplete="off" />
          </FormField>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="font-semibold">{t("settings.address.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("settings.address.description")}</p>
            </div>
            <div className="grid grid-cols-6 gap-3">
              <FormField label={t("settings.fields.street")} htmlFor="address-street" errors={errors("street")} className="col-span-6 sm:col-span-4">
                <Input id="address-street" name="street" defaultValue={address?.street ?? ""} autoComplete="address-line1" maxLength={120} />
              </FormField>
              <FormField label={t("settings.fields.number")} htmlFor="address-number" errors={errors("number")} className="col-span-3 sm:col-span-1">
                <Input id="address-number" name="number" defaultValue={address?.number ?? ""} maxLength={12} autoComplete="off" />
              </FormField>
              <FormField
                label={t("settings.fields.box")}
                htmlFor="address-box"
                optionalLabel={tCommon("form.optional")}
                errors={errors("box")}
                className="col-span-3 sm:col-span-1"
              >
                <Input id="address-box" name="box" defaultValue={address?.box ?? ""} maxLength={12} autoComplete="off" />
              </FormField>
              <FormField
                label={t("settings.fields.postalCode")}
                htmlFor="address-postal-code"
                errors={errors("postalCode")}
                className="col-span-2"
              >
                <Input
                  id="address-postal-code"
                  name="postalCode"
                  defaultValue={address?.postalCode ?? ""}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="postal-code"
                />
              </FormField>
              <FormField
                label={t("settings.fields.municipality")}
                htmlFor="address-municipality"
                errors={errors("municipality")}
                className="col-span-4"
              >
                <Input
                  id="address-municipality"
                  name="municipality"
                  defaultValue={address?.municipality ?? ""}
                  maxLength={80}
                  autoComplete="address-level2"
                />
              </FormField>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.address.country")}</p>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <IconChip icon={location ? MapPinIcon : MapPinOffIcon} tone={location ? "success" : "neutral"} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{t("settings.location.title")}</span>
                {location ? (
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {coordinate(location.latitude)}, {coordinate(location.longitude)} · {t(`settings.location.sources.${location.source}`)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {address ? t("settings.location.missing") : t("settings.location.none")}
                  </span>
                )}
              </div>
              {location && (
                <Button asChild variant="outline" size="sm">
                  <a href={mapUrl(location)} target="_blank" rel="noreferrer noopener">
                    <ExternalLinkIcon />
                    {t("settings.location.viewOnMap")}
                  </a>
                </Button>
              )}
            </div>

            <SegmentedControl
              name="locationMode"
              label={t("settings.location.mode")}
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "auto", label: t("settings.location.modes.auto") },
                { value: "manual", label: t("settings.location.modes.manual") },
              ]}
            />
            {mode === "manual" ? (
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("settings.fields.latitude")} htmlFor="location-latitude" errors={errors("latitude")}>
                  <Input
                    id="location-latitude"
                    name="latitude"
                    inputMode="decimal"
                    placeholder="50,92946"
                    defaultValue={coordinate(location?.latitude)}
                  />
                </FormField>
                <FormField label={t("settings.fields.longitude")} htmlFor="location-longitude" errors={errors("longitude")}>
                  <Input
                    id="location-longitude"
                    name="longitude"
                    inputMode="decimal"
                    placeholder="5,33703"
                    defaultValue={coordinate(location?.longitude)}
                  />
                </FormField>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("settings.location.autoHint")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("settings.location.usedFor")}</p>
          </div>
        </fieldset>

        {canManage ? (
          <CardFooter className="justify-end border-t pt-4">
            <Button type="submit" loading={busy}>
              {busy ? tCommon("form.saving") : tCommon("actions.save")}
            </Button>
          </CardFooter>
        ) : (
          <p className="text-sm text-muted-foreground">{t("settings.readOnly")}</p>
        )}
      </fetcher.Form>
    </Card>
  );
}

