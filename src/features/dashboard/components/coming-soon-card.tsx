import { BotIcon, HouseWifiIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";

/** The parts of WickedHome that are not built yet (docs/ROADMAP.md). Remove an item once it ships. */
const COMING: { key: string; icon: LucideIcon }[] = [
  { key: "assistant", icon: BotIcon },
  { key: "home", icon: HouseWifiIcon },
];

export function ComingSoonCard() {
  const { t } = useTranslation("dashboard");

  return (
    <Card className="gap-3 bg-card/60 shadow-none">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{t("comingSoon.title")}</CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {COMING.map(({ key, icon }) => (
          <li key={key} className="flex items-start gap-3">
            <IconChip icon={icon} tone="neutral" size="sm" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{t(`comingSoon.${key}.title`)}</span>
              <span className="text-xs text-muted-foreground">{t(`comingSoon.${key}.description`)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
