import { BatteryFullIcon, PlusIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { currentLocale } from "@/lib/i18n";
import { BatteryCard } from "../components/battery-card";
import { BatteryFormDialog } from "../components/battery-form-dialog";
import { formatKwp } from "../components/energy-format";
import { EnergyNav } from "../components/energy-nav";
import { GasSettingsCard } from "../components/gas-settings-card";
import { SolarInstallationCard } from "../components/solar-installation-card";
import { SolarInstallationFormDialog } from "../components/solar-installation-form-dialog";
import type { EnergySetup } from "../types/energy";
import { CanManageProvider } from "@/lib/permissions";

type EnergySetupScreenProps = {
  setup: EnergySetup;
  /** Today, `YYYY-MM-DD`: batteries installed later are shown as planned. */
  today: string;
  canManage: boolean;
};

export function EnergySetupScreen({ setup, today, canManage }: EnergySetupScreenProps) {
  const { t } = useTranslation("energy");
  const totalKwp = setup.solarInstallations.reduce((sum, installation) => sum + installation.kwp, 0);

  const addSolar = canManage && (
    <SolarInstallationFormDialog
      trigger={
        <Button variant={setup.solarInstallations.length ? "outline" : "default"}>
          <PlusIcon />
          {t("solar.add")}
        </Button>
      }
    />
  );
  const addBattery = canManage && (
    <BatteryFormDialog
      trigger={
        <Button variant={setup.batteries.length ? "outline" : "default"}>
          <PlusIcon />
          {t("battery.add")}
        </Button>
      }
    />
  );

  return (
    <CanManageProvider value={canManage}>
      <PageContainer>
        <PageHeader title={t("page.setup.title")} description={t("page.setup.description")} />
        <EnergyNav />

        <PageSection aria-labelledby="solar-heading">
          <SectionHeader
            id="solar-heading"
            title={t("solar.title")}
            description={totalKwp ? t("solar.total", { kwp: formatKwp(totalKwp, currentLocale()) }) : undefined}
            actions={setup.solarInstallations.length > 0 && addSolar}
          />
          {setup.solarInstallations.length === 0 ? (
            <EmptyState icon={SunIcon} title={t("solar.empty.title")} description={t("solar.empty.description")} action={addSolar} />
          ) : (
            <PageGrid columns="2">
              {setup.solarInstallations.map((installation) => (
                <SolarInstallationCard key={installation.id} installation={installation} />
              ))}
            </PageGrid>
          )}
        </PageSection>

        <PageSection aria-labelledby="gas-heading">
          <SectionHeader id="gas-heading" title={t("gas.title")} description={t("gas.description")} />
          <PageGrid columns="2">
            <GasSettingsCard settings={setup.settings} />
          </PageGrid>
        </PageSection>

        <PageSection aria-labelledby="battery-heading">
          <SectionHeader id="battery-heading" title={t("battery.title")} actions={setup.batteries.length > 0 && addBattery} />
          {setup.batteries.length === 0 ? (
            <EmptyState
              icon={BatteryFullIcon}
              title={t("battery.empty.title")}
              description={t("battery.empty.description")}
              action={addBattery}
            />
          ) : (
            <PageGrid columns="2">
              {setup.batteries.map((battery) => (
                <BatteryCard key={battery.id} battery={battery} today={today} />
              ))}
            </PageGrid>
          )}
        </PageSection>
      </PageContainer>
    </CanManageProvider>
  );
}
