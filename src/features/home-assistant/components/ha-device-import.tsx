import * as React from "react";
import { DownloadIcon, LinkIcon, MapPinIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineAlert } from "@/components/shared/inline-alert";
import { ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { importHaDevices } from "../data/home-assistant-requests";
import type { HaDeviceSuggestion } from "../types/home-assistant";

type HaDeviceImportProps = {
  suggestions: HaDeviceSuggestion[];
  canManage: boolean;
};

type Row = { selected: boolean; name: string };

/**
 * "Import from Home Assistant": entities that look like devices (door/window contacts, temperature sensors,
 * the alarm panel, washer/dryer power, motion, smoke) with the preset they would use. Tick, rename, import:
 * each becomes a device whose main field follows the entity live. A multi-step import, so a bespoke list.
 */
export function HaDeviceImport({ suggestions, canManage }: HaDeviceImportProps) {
  const { t } = useTranslation("home-assistant");
  const revalidator = useRevalidator();
  const [rows, setRows] = React.useState<Record<string, Row>>(() =>
    Object.fromEntries(suggestions.map((suggestion) => [suggestion.entityId, { selected: false, name: suggestion.name }])),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const chosen = suggestions.filter((suggestion) => rows[suggestion.entityId]?.selected);

  if (suggestions.length === 0) {
    return <EmptyState icon={SparklesIcon} title={t("import.empty.title")} description={t("import.empty.description")} className="py-8" />;
  }

  const update = (entityId: string, change: Partial<Row>) =>
    setRows((current) => ({ ...current, [entityId]: { ...(current[entityId] ?? { selected: false, name: "" }), ...change } }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await importHaDevices({
        items: chosen.map((suggestion) => ({
          entityId: suggestion.entityId,
          name: (rows[suggestion.entityId]?.name ?? suggestion.name).trim().slice(0, 60) || suggestion.name,
          presetKey: suggestion.presetKey,
        })),
      });
      toast.success(t("import.done", { count: result.created }));
      setRows((current) => Object.fromEntries(Object.entries(current).map(([id, row]) => [id, { ...row, selected: false }])));
      void revalidator.revalidate();
    } catch (failure) {
      setError(failure instanceof ApiRequestError && failure.status === 400 ? t("import.invalid") : t("alarm.errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && !busy && <InlineAlert tone="error">{error}</InlineAlert>}
      <fieldset disabled={busy || !canManage} className="contents">
        <ul className="flex flex-col divide-y rounded-lg border">
          {suggestions.map((suggestion) => {
            const row = rows[suggestion.entityId];
            const id = `ha-import-${suggestion.entityId}`;
            return (
              <li key={suggestion.entityId} className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center", suggestion.alreadyBound && "opacity-70")}>
                <label htmlFor={id} className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    id={id}
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={row?.selected ?? false}
                    onChange={(event) => update(suggestion.entityId, { selected: event.target.checked })}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {t(`import.presets.${suggestion.presetKey}`)}
                      {suggestion.alreadyBound && (
                        <Badge variant="secondary">
                          <LinkIcon />
                          {t("entities.bound")}
                        </Badge>
                      )}
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground">{suggestion.entityId}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {suggestion.area && (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="size-3" aria-hidden="true" />
                          {suggestion.area}
                        </span>
                      )}
                      <span className="tabular-nums">
                        {suggestion.state}
                        {suggestion.unit ? ` ${suggestion.unit}` : ""}
                      </span>
                    </span>
                  </span>
                </label>
                <Input
                  aria-label={t("import.name")}
                  value={row?.name ?? suggestion.name}
                  onChange={(event) => update(suggestion.entityId, { name: event.target.value })}
                  maxLength={60}
                  className="text-base sm:w-56 sm:text-sm"
                  disabled={!row?.selected}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("import.hint")}</p>
          <Button onClick={() => void submit()} loading={busy} disabled={chosen.length === 0}>
            <DownloadIcon />
            {busy ? t("import.importing") : t("import.action", { count: chosen.length })}
          </Button>
        </div>
      )}
    </div>
  );
}
