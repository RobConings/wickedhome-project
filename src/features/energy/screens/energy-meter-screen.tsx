import { Text } from "@/components/ui/text";
import type { ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, GaugeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardTitle } from "@/components/shared/card";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { CarrierBadge } from "../components/carrier-badge";
import { EnergyMeterList } from "../components/energy-meter-list";
import { MeterReadingForm } from "../components/meter-reading-form";
import type { Appliance, EnergyMeterDetail, ReadingMeter } from "../types/energy";

export function EnergyMeterScreen({ detail, appliances, now, canManage, attachments }: {
  detail: EnergyMeterDetail; appliances: Appliance[]; now: { date: string; time: string }; canManage: boolean; attachments?: ReactNode;
}) {
  const { t } = useTranslation("energy");
  const [search] = useSearchParams();
  const { meter, readings } = detail;
  const pages = Math.max(1, Math.ceil(readings.total / readings.pageSize));
  const href = (page: number) => { const next = new URLSearchParams(search); next.set("page", String(page)); return `?${next}`; };
  const inputMeter: ReadingMeter = meter.carrier === "gas" ? meter.kind === "appliance" ? "gas_appliance" : "gas" : meter.kind;
  return <PageContainer>
    <PageHeader title={meter.name} icon={GaugeIcon} backTo="/energy/import" description={t(`sources.${meter.source}`)} actions={<Button asChild variant="outline"><RecordLink to={meter.carrier === "water" ? "/energy" : `/energy?carrier=${meter.carrier}`}>{t("detail.openEnergy")}</RecordLink></Button>} />
    <Card><CardTitle>{t("sourceRecord.meter")}</CardTitle><DescriptionList>
      <DescriptionItem label={t("appliances.fields.carriers")}><CarrierBadge carrier={meter.carrier} /></DescriptionItem>
      <DescriptionItem label={t("readings.fields.kind")}>{t(`kinds.${meter.kind}`)}</DescriptionItem>
      <DescriptionItem label={t("readings.fields.register")}>{t(`registers.${meter.register}`)}</DescriptionItem>
      <DescriptionItem label={t("sourceRecord.ean")}>{meter.ean ?? t("detail.notRecorded")}</DescriptionItem>
      {meter.haStatisticId && <DescriptionItem wide label={t("sourceRecord.statistic")}><span className="break-all">{meter.haStatisticId}</span></DescriptionItem>}
      {detail.appliance && <DescriptionItem label={t("readings.fields.appliance")}><RecordLink className="underline" to={`/energy/appliances/${encodeURIComponent(detail.appliance.id)}`}>{detail.appliance.name}</RecordLink></DescriptionItem>}
      {detail.solar && <DescriptionItem label={t("solar.title")}><RecordLink className="underline" to={`/energy/solar/${encodeURIComponent(detail.solar.id)}`}>{detail.solar.name}</RecordLink></DescriptionItem>}
      {detail.battery && <DescriptionItem label={t("battery.title")}><RecordLink className="underline" to={`/energy/batteries/${encodeURIComponent(detail.battery.id)}`}>{detail.battery.name}</RecordLink></DescriptionItem>}
    </DescriptionList>
      {meter.source === "home_assistant" && canManage && <RecordLink to="/home-assistant" className="min-h-11 py-2 font-medium underline">{t("sourceRecord.mapping")}</RecordLink>}
    </Card>
    <EnergyMeterList meters={[meter]} appliances={appliances} />
    <MeterReadingForm key={meter.id} readings={readings.items} appliances={appliances} now={now} canManage={canManage && meter.source === "manual" && meter.carrier !== "water"} defaults={{ meter: inputMeter, register: meter.register, applianceId: meter.applianceId }} historyLabel={t("sourceRecord.readingCount", { count: readings.total })} />
    <nav aria-label={t("sourceRecord.pagination")} className="flex flex-wrap items-center justify-between gap-3">
      {readings.page > 1 ? <Button asChild variant="outline"><Link to={href(readings.page - 1)}><ChevronLeftIcon />{t("sourceRecord.previous")}</Link></Button> : <span />}
      <Text size="sm" tone="muted">{t("sourceRecord.pageOf", { page: readings.page, pages })}</Text>
      {readings.page < pages ? <Button asChild variant="outline"><Link to={href(readings.page + 1)}>{t("sourceRecord.next")}<ChevronRightIcon /></Link></Button> : <span />}
    </nav>
    {attachments}
  </PageContainer>;
}
