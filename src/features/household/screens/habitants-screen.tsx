import { PlusIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { EmptyState } from "../components/empty-state";
import { GeneralList } from "../components/general-list";
import { PageHeader } from "../components/page-header";
import { useSamePagePending } from "../lib/pending";
import { HabitantCard } from "../components/habitant-card";
import { HabitantFormDialog } from "../components/habitant-form-dialog";
import { HabitantListItem } from "../components/habitant-list-item";
import type { HouseholdOverview } from "../types/household";

type HabitantsScreenProps = {
  overview: HouseholdOverview;
  /** Adults and owners manage habitants; children only look. */
  canManage: boolean;
};

export function HabitantsScreen({ overview, canManage }: HabitantsScreenProps) {
  const { t } = useTranslation("household");
  const pending = useSamePagePending();

  const addButton = canManage && (
    <HabitantFormDialog
      trigger={
        <Button>
          <PlusIcon />
          {t("actions.add")}
        </Button>
      }
    />
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow={overview.household.name}
        title={t("page.title")}
        description={t("page.description")}
        actions={addButton}
      />
      <GeneralList
        label={t("page.title")}
        items={overview.habitants}
        getKey={(habitant) => habitant.id}
        renderRow={(habitant) => <HabitantListItem habitant={habitant} canManage={canManage} />}
        renderTile={(habitant) => <HabitantCard habitant={habitant} canManage={canManage} />}
        search={{ keys: (habitant) => [habitant.name, habitant.emoji, t(`types.${habitant.type}`)] }}
        storageKey="habitants"
        defaultView="tiles"
        pending={pending}
        emptyState={
          <EmptyState icon={UsersIcon} title={t("empty.title")} description={t("empty.description")} action={addButton} />
        }
      />
    </PageContainer>
  );
}
