import * as React from "react";
import { RefreshCwIcon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "./empty-state";
import { InlineAlert } from "./inline-alert";
import { AppliancePicker, type Appliance } from "@/features/energy";
import type { HomeAssistantActionResult } from "../data/home-assistant-loaders";
import type { HaEnergyOverview } from "../types/home-assistant";
import { formatDateTime } from "./ha-format";

type HaEnergyPanelProps = {
  energy: HaEnergyOverview;
  appliances: Appliance[];
  canManage: boolean;
};

/**
 * Energy from Home Assistant: what its energy dashboard measures (grid per tariff, solar, battery, gas) and is
 * imported hourly, the last import, and per measured device the appliance it fills in (so "unknown" shrinks).
 */
export function HaEnergyPanel({ energy, appliances, canManage }: HaEnergyPanelProps) {
  const { t, i18n } = useTranslation("home-assistant");
  const links = useFetcher<HomeAssistantActionResult>({ key: "ha-energy-links" });
  const settings = useFetcher<HomeAssistantActionResult>({ key: "ha-energy-settings" });
  const importer = useFetcher<HomeAssistantActionResult>({ key: "ha-energy-import" });
  const initial = React.useMemo(() => Object.fromEntries(energy.devices.map((device) => [device.statisticId, device.applianceId])), [energy.devices]);
  const [linked, setLinked] = React.useState<Record<string, string | null>>(initial);
  const dirty = energy.devices.some((device) => (linked[device.statisticId] ?? null) !== (initial[device.statisticId] ?? null));
  const enabled = settings.json && typeof settings.json === "object" ? Boolean((settings.json as { settings?: { energyImportEnabled?: boolean } }).settings?.energyImportEnabled) : energy.enabled;

  const handled = React.useRef(new Set<HomeAssistantActionResult>());
  React.useEffect(() => {
    for (const [fetcher, message] of [
      [links, t("energy.linksSaved")],
      [importer, t("energy.importStarted")],
    ] as const) {
      if (fetcher.state !== "idle" || !fetcher.data || handled.current.has(fetcher.data)) continue;
      handled.current.add(fetcher.data);
      if (fetcher.data.ok) toast.success(message);
      else if (fetcher.data.formError) toast.error(fetcher.data.formError);
    }
  }, [links, importer, t]);

  const nameOf = (statisticId: string) => energy.devices.find((device) => device.statisticId === statisticId)?.name ?? statisticId;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="font-medium">{energy.lastImportAt ? t("energy.lastImport", { when: formatDateTime(energy.lastImportAt, i18n.language) }) : t("energy.neverImported")}</span>
          {energy.lastResult && <span className="text-xs text-muted-foreground">{energy.lastResult}</span>}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="ha-energy-enabled"
                checked={enabled}
                disabled={settings.state !== "idle"}
                onCheckedChange={(checked) =>
                  void settings.submit({ intent: "save-settings", settings: { energyImportEnabled: checked } }, { method: "post", encType: "application/json" })
                }
              />
              <Label htmlFor="ha-energy-enabled" className="text-sm font-normal">
                {t("energy.enabled")}
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={importer.state !== "idle"}
              disabled={!enabled || energy.status.state !== "connected"}
              onClick={() => void importer.submit({ intent: "import-energy" }, { method: "post", encType: "application/json" })}
            >
              <RefreshCwIcon />
              {t("energy.importNow")}
            </Button>
          </div>
        )}
      </div>

      {energy.sources === null ? (
        <InlineAlert>{energy.status.state === "connected" ? t("energy.noPrefs") : t("energy.notConnected")}</InlineAlert>
      ) : energy.sources.length === 0 ? (
        <InlineAlert>{t("energy.noSources")}</InlineAlert>
      ) : (
        <section className="flex flex-col gap-2" aria-labelledby="ha-energy-sources">
          <h3 id="ha-energy-sources" className="text-sm font-medium">
            {t("energy.sources")}
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {energy.sources.map((source) => (
              <li key={source.statisticId} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {t(`energy.kinds.${source.carrier === "gas" ? "gas" : source.kind}`)}
                    {source.register !== "single" && ` · ${t(`energy.registers.${source.register}`)}`}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{source.statisticId}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {source.intervalCount > 0 && source.lastAt
                    ? t("energy.hoursUntil", { count: source.intervalCount, when: formatDateTime(source.lastAt, i18n.language) })
                    : t("energy.noData")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="ha-energy-devices">
        <h3 id="ha-energy-devices" className="text-sm font-medium">
          {t("energy.devices")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("energy.devicesHint")}</p>
        {energy.devices.length === 0 ? (
          <EmptyState icon={ZapIcon} title={t("energy.noDevices.title")} description={t("energy.noDevices.description")} className="py-8" />
        ) : (
          <>
            {links.data?.formError && links.state === "idle" && <InlineAlert tone="error">{links.data.formError}</InlineAlert>}
            <fieldset disabled={links.state !== "idle" || !canManage} className="contents">
              <ul className="flex flex-col divide-y rounded-lg border">
                {energy.devices.map((device) => (
                  <li key={device.statisticId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex min-w-0 flex-col text-sm">
                      <span className="font-medium">{device.name ?? device.statisticId}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{device.statisticId}</span>
                      {device.includedIn && <span className="text-xs text-muted-foreground">{t("energy.includedIn", { parent: nameOf(device.includedIn) })}</span>}
                      {device.intervalCount > 0 && <span className="text-xs text-muted-foreground">{t("energy.hours", { count: device.intervalCount })}</span>}
                    </span>
                    <AppliancePicker
                      appliances={appliances}
                      value={linked[device.statisticId] ?? null}
                      onChange={(id) => setLinked((current) => ({ ...current, [device.statisticId]: id }))}
                      clearable
                      placeholder={t("energy.pickAppliance")}
                      className="sm:w-64"
                      disabled={!canManage}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
            {canManage && (
              <div className="flex justify-end">
                <Button
                  loading={links.state !== "idle"}
                  disabled={!dirty}
                  onClick={() =>
                    void links.submit(
                      {
                        intent: "save-links",
                        links: energy.devices.map((device) => ({ statisticId: device.statisticId, applianceId: linked[device.statisticId] ?? null })),
                      },
                      { method: "post", encType: "application/json" },
                    )
                  }
                >
                  {t("energy.saveLinks")}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
