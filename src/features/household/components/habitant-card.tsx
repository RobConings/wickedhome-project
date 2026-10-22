import { CakeIcon, KeyRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Inline } from "@/components/layout/inline";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/shared/card";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { Habitant } from "../types/household";
import { HabitantActions } from "./habitant-actions";
import { HabitantAvatar } from "./habitant-avatar";
import { HabitantTypeBadge } from "./habitant-type-badge";

type HabitantCardProps = {
  habitant: Habitant;
  /** Show edit and delete actions. */
  canManage: boolean;
};

/** A habitant as a tile: compact enough for two per row on a phone. */
export function HabitantCard({ habitant, canManage }: HabitantCardProps) {
  const { t } = useTranslation("household");

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader className="flex-col items-start justify-start gap-3 sm:flex-row sm:items-center sm:gap-4">
        <HabitantAvatar habitant={habitant} size="lg" />
        <div className="flex w-full min-w-0 flex-col items-start gap-1.5">
          <CardTitle className="w-full truncate text-lg">{habitant.name}</CardTitle>
          <HabitantTypeBadge type={habitant.type} />
        </div>
      </CardHeader>

      <Inline gap="md" wrap className="min-h-5 text-sm text-muted-foreground">
        {habitant.birthday && (
          <Inline gap="xs">
            <CakeIcon className="size-4" aria-hidden="true" />
            {formatDate(habitant.birthday, currentLocale())}
          </Inline>
        )}
        {habitant.hasAccount && (
          <Inline gap="xs">
            <KeyRoundIcon className="size-4" aria-hidden="true" />
            {t("card.hasAccount")}
          </Inline>
        )}
      </Inline>

      {canManage && (
        <CardFooter className="justify-end border-t pt-3">
          <HabitantActions habitant={habitant} />
        </CardFooter>
      )}
    </Card>
  );
}
