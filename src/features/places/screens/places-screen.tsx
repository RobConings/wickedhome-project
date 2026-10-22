import { MapPinIcon, PlusIcon, SparklesIcon, TreesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { PageSection } from "../components/page-section";
import { Stack } from "../components/stack";
import { EmptyState } from "../components/empty-state";
import { PageHeader } from "../components/page-header";
import { SectionHeader } from "../components/section-header";
import { FloorFormDialog } from "../components/floor-form-dialog";
import { FloorSection } from "../components/floor-section";
import { PlaceFormDialog } from "../components/place-form-dialog";
import type { PlacesActionResult } from "../data/places-loaders";
import type { Floor, PlacesOverview } from "../types/places";

type PlacesScreenProps = {
  overview: PlacesOverview;
  /** Adults and owners manage places; children only look. */
  canManage: boolean;
};

/** Floors with their rooms, and the outdoor plan with its zones. List first; the plans are one click away. */
export function PlacesScreen({ overview, canManage }: PlacesScreenProps) {
  const { t } = useTranslation("places");
  const starter = useFetcher<PlacesActionResult>({ key: "places-starter" });
  const { floors, places } = overview;
  const indoor = floors.filter((floor) => floor.kind === "indoor");
  const outdoor = floors.filter((floor) => floor.kind === "outdoor");

  const placesOn = (floor: Floor) => places.filter((place) => place.floorId === floor.id);

  const actions = canManage && floors.length > 0 && (
    <>
      <FloorFormDialog
        trigger={
          <Button variant="outline">
            <PlusIcon />
            {t("actions.addFloor")}
          </Button>
        }
      />
      <PlaceFormDialog
        floors={floors}
        trigger={
          <Button>
            <PlusIcon />
            {t("actions.addPlace")}
          </Button>
        }
      />
    </>
  );

  const renderFloors = (list: Floor[]) => (
    <Stack gap="md">
      {list.map((floor) => (
        <FloorSection key={floor.id} floor={floor} places={placesOn(floor)} canManage={canManage} />
      ))}
    </Stack>
  );

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={actions} />

      {floors.length === 0 ? (
        <EmptyState
          icon={MapPinIcon}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            canManage && (
              <div className="flex flex-wrap justify-center gap-2">
                <starter.Form method="post">
                  <input type="hidden" name="intent" value="create-starter" />
                  <Button type="submit" loading={starter.state !== "idle"}>
                    <SparklesIcon />
                    {t("empty.starter")}
                  </Button>
                </starter.Form>
                <FloorFormDialog
                  trigger={
                    <Button variant="outline">
                      <PlusIcon />
                      {t("actions.addFloor")}
                    </Button>
                  }
                />
              </div>
            )
          }
        />
      ) : (
        <>
          {indoor.length > 0 && (
            <PageSection aria-labelledby="places-inside">
              <SectionHeader id="places-inside" title={t("sections.inside")} description={t("sections.insideDescription")} />
              {renderFloors(indoor)}
            </PageSection>
          )}
          <PageSection aria-labelledby="places-outside">
            <SectionHeader id="places-outside" title={t("sections.outside")} description={t("sections.outsideDescription")} />
            {outdoor.length > 0 ? (
              renderFloors(outdoor)
            ) : (
              <EmptyState
                icon={TreesIcon}
                title={t("empty.outsideTitle")}
                description={t("empty.outsideDescription")}
                action={
                  canManage && (
                    <FloorFormDialog
                      defaultKind="outdoor"
                      trigger={
                        <Button variant="outline">
                          <PlusIcon />
                          {t("actions.addOutside")}
                        </Button>
                      }
                    />
                  )
                }
              />
            )}
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
