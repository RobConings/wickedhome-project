import type { ReactNode } from "react";
import { BatteryFullIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageHeader } from "@/components/shared/page-header";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { SolarInstallationCard } from "../components/solar-installation-card";
import { BatteryCard } from "../components/battery-card";
import { EnergyMeterList } from "../components/energy-meter-list";
import type { EnergyMeter, HomeBattery, SolarInstallation } from "../types/energy";

export function EnergySourceScreen({ solar, battery, meters, today, canManage, attachments }: {
  solar: SolarInstallation | null; battery: HomeBattery | null; meters: EnergyMeter[]; today: string; canManage: boolean; attachments?: ReactNode;
}) {
  const { t } = useTranslation("energy");
  return <PageContainer>
    <PageHeader title={solar?.name ?? battery!.name} icon={solar ? SunIcon : BatteryFullIcon} backTo="/energy/setup" description={t("sourceRecord.configurationHint")} actions={<Button asChild><RecordLink to="/energy">{t("detail.openEnergy")}</RecordLink></Button>} />
    <PageGrid columns="main-sidebar">
      <div className="flex min-w-0 flex-col gap-6">
        {solar ? <SolarInstallationCard installation={solar} canManage={canManage} linkName={false} /> : <BatteryCard battery={battery!} today={today} canManage={canManage} linkName={false} />}
        {attachments}
      </div>
      <EnergyMeterList meters={meters} appliances={[]} />
    </PageGrid>
  </PageContainer>;
}
