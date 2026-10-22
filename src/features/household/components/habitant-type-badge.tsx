import { BabyIcon, PawPrintIcon, UserIcon, UserRoundPlusIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { HabitantType } from "../types/household";

const HABITANT_TYPE_ICONS: Record<HabitantType, LucideIcon> = {
  adult: UserIcon,
  child: BabyIcon,
  pet: PawPrintIcon,
  guest: UserRoundPlusIcon,
};

export function HabitantTypeBadge({ type }: { type: HabitantType }) {
  const { t } = useTranslation("household");
  const Icon = HABITANT_TYPE_ICONS[type];
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Icon aria-hidden="true" />
      {t(`types.${type}`)}
    </Badge>
  );
}
