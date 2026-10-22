import { FlameIcon, PencilIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/shared/card";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { currentLocale } from "@/lib/i18n";
import type { EnergySettings } from "../types/energy";
import { formatCalorific } from "./energy-format";
import { GasSettingsFormDialog } from "./gas-settings-form-dialog";

type GasSettingsCardProps = {
  settings: EnergySettings;
  canManage: boolean;
};

/** The gas connection at a glance: EAN and the calorific value for manual readings. */
export function GasSettingsCard({ settings, canManage }: GasSettingsCardProps) {
  const { t } = useTranslation("energy");
  const { t: tCommon } = useTranslation();
  return (
    <Card>
      <CardHeader className="items-center justify-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
          <FlameIcon className="size-5" aria-hidden="true" />
        </span>
        <CardTitle>{t("gas.meter")}</CardTitle>
      </CardHeader>
      <DescriptionList>
        <DescriptionItem label={t("gas.fields.ean")}>{settings.gasEan ?? t("gas.noEan")}</DescriptionItem>
        <DescriptionItem label={t("gas.fields.calorific")}>
          {formatCalorific(settings.gasCalorificKwhPerM3, currentLocale())}
        </DescriptionItem>
      </DescriptionList>
      <p className="text-sm text-muted-foreground">{t("gas.calorificExplained")}</p>
      {canManage && (
        <CardFooter className="justify-end border-t pt-3">
          <GasSettingsFormDialog
            settings={settings}
            trigger={
              <Button variant="ghost" size="sm">
                <PencilIcon />
                {tCommon("actions.edit")}
              </Button>
            }
          />
        </CardFooter>
      )}
    </Card>
  );
}
