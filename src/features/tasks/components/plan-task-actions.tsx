import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchHouseholdOverview } from "@/features/household";
import { fetchPlaces } from "@/features/places";
import { fetchTasksOverview } from "../data/tasks-requests";
import { TaskFormDialog } from "./task-form-dialog";

/** A plan selection contributes a real room relationship, without inventing an exact task position. */
export function PlanTaskActions({ placeId }: { placeId: string }) {
  const { t } = useTranslation("tasks");
  const { data, error, refresh } = useAsyncResource(`plan-task:${placeId}`, async () => {
    const [overview, household, places] = await Promise.all([fetchTasksOverview({ placeId }), fetchHouseholdOverview(), fetchPlaces()]);
    return { overview, habitants: household.habitants, places };
  });
  if (error) return <Button variant="outline" onClick={refresh}>{t("project.error")}</Button>;
  if (!data) return <Button disabled variant="outline">{t("project.loading")}</Button>;
  if (!data.overview.viewer.canManage) return null;
  return <TaskFormDialog habitants={data.habitants} places={data.places} today={data.overview.today} defaults={{ placeId }} trigger={<Button variant="outline"><PlusIcon />{t("actions.add")}</Button>} />;
}
