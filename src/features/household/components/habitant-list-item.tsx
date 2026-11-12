import { Stack } from "@/components/layout/stack";
import { RecordLink } from "@/components/shared/record-link";
import { CakeIcon, KeyRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Inline } from "@/components/layout/inline";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { Habitant } from "../types/household";
import { HabitantActions } from "./habitant-actions";
import { HabitantAvatar } from "./habitant-avatar";
import { HabitantTypeBadge } from "./habitant-type-badge";

type HabitantListItemProps = {
  habitant: Habitant;
  /** Show edit and delete actions. */
  canManage: boolean;
};

/** A habitant as a row of the list view. */
export function HabitantListItem({ habitant, canManage }: HabitantListItemProps) {
  const { t } = useTranslation("household");
  return (
    <Inline gap="md" className="min-w-0">
      <HabitantAvatar habitant={habitant} />
      <Stack gap="xs" className="min-w-0 flex-1">
        <Inline gap="sm" wrap className="min-w-0">
          <RecordLink className="break-words font-medium" to={`/habitants/${encodeURIComponent(habitant.id)}`}>{habitant.name}</RecordLink>
          <HabitantTypeBadge type={habitant.type} />
        </Inline>
        {(habitant.birthday || habitant.hasAccount) && (
          <Inline gap="md" wrap className="text-xs text-muted-foreground">
            {habitant.birthday && (
              <Inline gap="xs">
                <CakeIcon className="size-3.5" aria-hidden="true" />
                {formatDate(habitant.birthday, currentLocale())}
              </Inline>
            )}
            {habitant.hasAccount && (
              <Inline gap="xs">
                <KeyRoundIcon className="size-3.5" aria-hidden="true" />
                {t("card.hasAccount")}
              </Inline>
            )}
          </Inline>
        )}
      </Stack>
      {canManage && <HabitantActions habitant={habitant} iconOnly />}
    </Inline>
  );
}
