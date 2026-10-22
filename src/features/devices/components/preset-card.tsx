import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "./card";
import { cn } from "@/lib/utils";
import type { DevicePresetSummary } from "../types/devices";
import { DeviceIcon } from "./device-icon";

type PresetCardProps = {
  preset: DevicePresetSummary;
  /** Adults and owners add profiles. */
  canManage: boolean;
  /** A tile, or the content of a list row (the list draws the dividers and padding). */
  variant?: "card" | "row";
  className?: string;
};

/** A ready-made profile; "Add" creates an editable copy and opens the editor. */
export function PresetCard({ preset, canManage, variant = "card", className }: PresetCardProps) {
  const { t } = useTranslation("devices");
  const fetcher = useFetcher({ key: `preset-${preset.key}` });
  const icon = (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
      <DeviceIcon icon={preset.icon} />
    </span>
  );
  const text = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="font-medium break-words">{preset.name}</span>
      <span className="text-xs text-muted-foreground">{preset.description}</span>
    </div>
  );
  const addForm = canManage && (
    <fetcher.Form method="post" className={variant === "card" ? "mt-auto" : undefined}>
      <input type="hidden" name="intent" value="add-preset" />
      <input type="hidden" name="key" value={preset.key} />
      <Button type="submit" size="sm" variant="outline" loading={fetcher.state !== "idle"} aria-label={t("presets.addNamed", { name: preset.name })}>
        <PlusIcon />
        {fetcher.state !== "idle" ? t("presets.adding") : t("presets.add")}
      </Button>
    </fetcher.Form>
  );

  if (variant === "row") {
    return (
      <div className={cn("flex items-start gap-3", className)}>
        {icon}
        {text}
        {addForm}
      </div>
    );
  }
  return (
    <Card className={cn("gap-3 p-4", className)}>
      {icon}
      {text}
      {addForm}
    </Card>
  );
}
