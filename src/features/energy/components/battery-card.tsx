import * as React from "react";
import { BatteryFullIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "./card";
import { ConfirmDialog } from "./confirm-dialog";
import { DescriptionItem, DescriptionList } from "./description-list";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { EnergyActionResult } from "../data/energy-loaders";
import type { HomeBattery } from "../types/energy";
import { BatteryFormDialog } from "./battery-form-dialog";
import { formatKw, formatKwh } from "./energy-format";

type BatteryCardProps = {
  battery: HomeBattery;
  /** Today (`YYYY-MM-DD`); a battery installed later is shown as planned. */
  today: string;
  canManage: boolean;
};

export function BatteryCard({ battery, today, canManage }: BatteryCardProps) {
  const { t } = useTranslation("energy");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const fetcher = useFetcher<EnergyActionResult>();
  const planned = battery.installedOn !== null && battery.installedOn > today;

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  return (
    <Card className={fetcher.state !== "idle" ? "opacity-50" : undefined}>
      <CardHeader className="items-center justify-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
          <BatteryFullIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <CardTitle className="truncate">{battery.name}</CardTitle>
          {planned && <Badge variant="outline">{t("battery.planned")}</Badge>}
        </div>
        <p className="ml-auto text-xl font-semibold">{formatKwh(battery.capacityWh, locale)}</p>
      </CardHeader>

      <DescriptionList>
        {battery.maxChargeW != null && (
          <DescriptionItem label={t("battery.maxCharge")}>{formatKw(battery.maxChargeW / 1000, locale)}</DescriptionItem>
        )}
        {battery.maxDischargeW != null && (
          <DescriptionItem label={t("battery.maxDischarge")}>{formatKw(battery.maxDischargeW / 1000, locale)}</DescriptionItem>
        )}
        {battery.installedOn && (
          <DescriptionItem label={t("battery.installedOn")}>{formatDate(battery.installedOn, locale)}</DescriptionItem>
        )}
      </DescriptionList>

      {canManage && (
        <CardFooter className="justify-end border-t pt-3">
          <BatteryFormDialog
            battery={battery}
            trigger={
              <Button variant="ghost" size="sm">
                <PencilIcon />
                {tCommon("actions.edit")}
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2Icon />
                {tCommon("actions.delete")}
              </Button>
            }
            title={t("battery.delete.title", { name: battery.name })}
            description={t("battery.delete.description")}
            confirmLabel={tCommon("actions.delete")}
            cancelLabel={tCommon("actions.cancel")}
            destructive
            onConfirm={() => fetcher.submit({ intent: "delete-battery", id: battery.id }, { method: "post" })}
          />
        </CardFooter>
      )}
    </Card>
  );
}
