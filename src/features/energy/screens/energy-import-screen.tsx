import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Stack } from "@/components/layout/stack";
import { PendingContent } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { useSamePagePending } from "@/lib/pending";
import { EnergyMeterList } from "../components/energy-meter-list";
import { EnergyNav } from "../components/energy-nav";
import { FluviusImport, type FluviusImportState } from "../components/fluvius-import";
import { MeterReadingForm } from "../components/meter-reading-form";
import type { uploadFluviusFile } from "../data/energy-requests";
import type { Appliance, EnergyDataOverview, EnergySettings } from "../types/energy";

type EnergyImportScreenProps = {
  data: EnergyDataOverview;
  appliances: Appliance[];
  /** Gas calorific value for files in m³ without one. */
  settings?: EnergySettings;
  /** Default date and time for a new reading, local. */
  now: { date: string; time: string };
  canManage: boolean;
  /** Stories: start the import in a given stage and fake the upload. */
  initialImportState?: FluviusImportState;
  upload?: typeof uploadFluviusFile;
};

export function EnergyImportScreen({
  data,
  appliances,
  settings,
  now,
  canManage,
  initialImportState,
  upload,
}: EnergyImportScreenProps) {
  const { t } = useTranslation("energy");
  const { t: tCommon } = useTranslation();
  // After an import or a reading the list of channels refreshes.
  const refreshing = useSamePagePending();
  return (
    <PageContainer>
      <PageHeader title={t("page.import.title")} description={t("page.import.description")} />
      <EnergyNav />
      <PageGrid columns="main-sidebar">
        <Stack gap="lg" className="min-w-0">
          {canManage && (
            <FluviusImport
              initialState={initialImportState}
              upload={upload}
              defaultCalorificKwhPerM3={settings?.gasCalorificKwhPerM3}
            />
          )}
          <MeterReadingForm readings={data.readings} appliances={appliances} now={now} canManage={canManage} />
        </Stack>
        <PendingContent pending={refreshing} label={tCommon("loading.updating")} className="min-w-0">
          <EnergyMeterList meters={data.meters} appliances={appliances} />
        </PendingContent>
      </PageGrid>
    </PageContainer>
  );
}
