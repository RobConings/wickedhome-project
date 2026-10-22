import * as React from "react";
import { PencilIcon, SunIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/shared/card";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { EnergyActionResult } from "../data/energy-loaders";
import { compassPoint, type SolarInstallation } from "../types/energy";
import { formatKwp } from "./energy-format";
import { SolarInstallationFormDialog } from "./solar-installation-form-dialog";
import { useFetcherErrorToast } from "@/lib/hooks/use-fetcher-result";
import { useCanManage } from "@/lib/permissions";

type SolarInstallationCardProps = {
  installation: SolarInstallation;
  /** Defaults to the nearest `CanManageProvider`. */
  canManage?: boolean;
};

export function SolarInstallationCard({ installation, canManage: canManageProp }: SolarInstallationCardProps) {
  const canManage = useCanManage(canManageProp);
  const { t } = useTranslation("energy");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const fetcher = useFetcher<EnergyActionResult>();

  useFetcherErrorToast(fetcher);

  const orientation = [
    installation.azimuthDeg != null &&
      t("solar.facing", { direction: t(`compass.${compassPoint(installation.azimuthDeg)}`).toLowerCase() }),
    installation.tiltDeg != null && t("solar.tilt", { tilt: installation.tiltDeg }),
  ].filter(Boolean);
  const inverter = [installation.inverterBrand, installation.inverterModel].filter(Boolean).join(" ");

  return (
    <Card className={fetcher.state !== "idle" ? "opacity-50" : undefined}>
      <CardHeader className="items-center justify-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-highlight text-highlight-foreground">
          <SunIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <CardTitle className="truncate">{installation.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("solar.panels", { count: installation.panelCount, wp: installation.panelWp })}
          </p>
        </div>
        <p className="ml-auto text-xl font-semibold">{formatKwp(installation.kwp, locale)}</p>
      </CardHeader>

      <DescriptionList>
        {orientation.length > 0 && (
          <DescriptionItem label={t("solar.fields.orientation")}>{orientation.join(" · ")}</DescriptionItem>
        )}
        {inverter && <DescriptionItem label={t("solar.inverter")}>{inverter}</DescriptionItem>}
        {installation.installedOn && (
          <DescriptionItem label={t("solar.installedOn")}>{formatDate(installation.installedOn, locale)}</DescriptionItem>
        )}
      </DescriptionList>

      {canManage && (
        <CardFooter className="justify-end border-t pt-3">
          <SolarInstallationFormDialog
            installation={installation}
            trigger={
              <Button variant="ghost" size="sm">
                <PencilIcon />
                {tCommon("actions.edit")}
              </Button>
            }
          />
          <DeleteConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2Icon />
                {tCommon("actions.delete")}
              </Button>
            }
            title={t("solar.delete.title", { name: installation.name })}
            description={t("solar.delete.description")}
            onConfirm={() => fetcher.submit({ intent: "delete-solar", id: installation.id }, { method: "post" })}
          />
        </CardFooter>
      )}
    </Card>
  );
}
