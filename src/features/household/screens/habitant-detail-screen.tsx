import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import type { ReactNode } from "react";
import { UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardTitle } from "@/components/shared/card";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { RecordLink } from "@/components/shared/record-link";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { HabitantActions } from "../components/habitant-actions";
import { HabitantAvatar } from "../components/habitant-avatar";
import { HabitantTypeBadge } from "../components/habitant-type-badge";
import type { Habitant, Household } from "../types/household";

export function HabitantDetailScreen({ habitant, household, canManage, tasks, attachments, finance }: {
  habitant: Habitant; household: Household; canManage: boolean; tasks?: ReactNode; attachments?: ReactNode; finance?: ReactNode;
}) {
  const { t } = useTranslation("household");
  return <PageContainer>
    <PageHeader title={habitant.name} eyebrow={household.name} icon={UsersIcon} backTo="/habitants" actions={canManage && <HabitantActions habitant={habitant} />} />
    <Card style={{ borderTopColor: habitant.color, borderTopWidth: 4 }}>
      <Inline gap="4" align="center"><HabitantAvatar habitant={habitant} size="lg" /><CardTitle>{t("detail.about")}</CardTitle></Inline>
      <DescriptionList>
        <DescriptionItem label={t("fields.type")}><HabitantTypeBadge type={habitant.type} /></DescriptionItem>
        <DescriptionItem label={t("fields.birthday")}>{habitant.birthday ? formatDate(habitant.birthday, currentLocale()) : t("detail.birthdayUnknown")}</DescriptionItem>
        <DescriptionItem label={t("card.hasAccount")}>{t(habitant.hasAccount ? "card.hasAccount" : "detail.noAccount")}</DescriptionItem>
      </DescriptionList>
      {canManage && habitant.type !== "pet" && <Stack gap="xs"><RecordLink to={`/income?view=received&person=${encodeURIComponent(habitant.id)}`} className="min-h-11 py-2 font-medium underline">{t("detail.income")}</RecordLink><Text size="sm" tone="muted">{t("detail.incomeHint")}</Text></Stack>}
    </Card>
    {finance}
    {tasks && <Card><CardTitle>{t("detail.tasks")}</CardTitle>{tasks}</Card>}
    {attachments}
  </PageContainer>;
}
