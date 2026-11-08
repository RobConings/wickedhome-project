import type { ReactNode } from "react";
import { PencilIcon, PlugIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionList, DescriptionItem } from "@/components/shared/description-list";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import type { Appliance, EnergyMeter } from "../types/energy";
import type { Place } from "@/features/places";
import type { EnergyActionResult } from "../data/energy-loaders";
import { ApplianceFormDialog } from "../components/appliance-form-dialog";
import { EnergyMeterList } from "../components/energy-meter-list";
import { CarrierBadge } from "../components/carrier-badge";

/** One appliance owns its configuration, meter sources, inclusion relationships and documents. */
export function ApplianceDetailScreen({ appliance, appliances, places, meters, canManage, attachments }: {
  appliance: Appliance; appliances: Appliance[]; places: Place[]; meters: EnergyMeter[]; canManage: boolean; attachments?: ReactNode;
}) {
  const { t } = useTranslation("energy");
  const { t: tc } = useTranslation();
  const fetcher = useFetcher<EnergyActionResult>();
  const parent = appliances.find((row) => row.id === appliance.parentApplianceId);
  const children = appliances.filter((row) => row.parentApplianceId === appliance.id);
  return <PageContainer>
    <PageHeader title={appliance.name} icon={PlugIcon} backTo="/energy/appliances" description={t(`categories.${appliance.category}`)} actions={canManage && <>
      <ApplianceFormDialog appliance={appliance} appliances={appliances} places={places} trigger={<Button><PencilIcon />{tc("actions.edit")}</Button>} />
      <ConfirmDialog trigger={<Button variant="outline"><Trash2Icon />{tc("actions.delete")}</Button>}
        title={t("appliances.delete.title", { name: appliance.name })} description={t("appliances.delete.description")}
        confirmLabel={tc("actions.delete")} cancelLabel={tc("actions.cancel")} destructive
        onConfirm={() => fetcher.submit({ intent: "delete", id: appliance.id, redirectTo: "/energy/appliances" }, { method: "post" })} />
    </>} />
    {fetcher.data?.formError && <p role="alert" className="text-destructive">{fetcher.data.formError}</p>}
    <PageGrid columns="main-sidebar">
      <div className="flex min-w-0 flex-col gap-6">
        <Card><CardTitle>{t("detail.title")}</CardTitle><DescriptionList>
          <DescriptionItem label={t("appliances.fields.carriers")}><span className="flex flex-wrap gap-2">{appliance.carriers.map((carrier) => <CarrierBadge key={carrier} carrier={carrier} />)}</span></DescriptionItem>
          <DescriptionItem label={t("appliances.fields.place")}>{appliance.place ? <RecordLink to={`/places/${encodeURIComponent(appliance.place.id)}`} className="underline">{appliance.place.name}</RecordLink> : t("detail.notRecorded")}</DescriptionItem>
          <DescriptionItem label={t("appliances.fields.ratedPowerW")}>{appliance.ratedPowerW === null ? t("detail.notRecorded") : `${appliance.ratedPowerW} W`}</DescriptionItem>
          <DescriptionItem label={t("appliances.fields.standbyPowerW")}>{appliance.standbyPowerW === null ? t("detail.notRecorded") : `${appliance.standbyPowerW} W`}</DescriptionItem>
          {appliance.device && <DescriptionItem label={t("detail.device")}><RecordLink to={`/devices/${encodeURIComponent(appliance.device.id)}`} className="underline">{appliance.device.name}</RecordLink></DescriptionItem>}
          {appliance.notes && <DescriptionItem wide label={t("appliances.fields.notes")}><span className="whitespace-pre-wrap">{appliance.notes}</span></DescriptionItem>}
        </DescriptionList></Card>
        <EnergyMeterList meters={meters} appliances={appliances} />
        {attachments}
      </div>
      <Card className="self-start"><CardTitle>{t("hierarchy.parent")}</CardTitle><p className="text-sm text-muted-foreground">{t("hierarchy.parentHint")}</p>
        {parent ? <RecordLink className="min-h-11 break-words py-2 font-medium underline" to={`/energy/appliances/${encodeURIComponent(parent.id)}`}>{parent.name}</RecordLink> : <p className="text-sm">{t("hierarchy.independent")}</p>}
        <h3 className="font-semibold">{t("detail.children")}</h3>
        {children.length > 0 ? <ul className="divide-y">{children.map((child) => <li key={child.id}><RecordLink to={`/energy/appliances/${encodeURIComponent(child.id)}`} className="flex min-h-11 items-center break-words py-2 text-sm underline">{child.name}</RecordLink></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("detail.noChildren")}</p>}
        <RecordLink className="flex min-h-11 items-center text-sm font-medium underline" to="/energy">{t("detail.openEnergy")}</RecordLink>
      </Card>
    </PageGrid>
  </PageContainer>;
}
