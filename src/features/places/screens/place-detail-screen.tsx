import type * as React from "react";
import { ArrowLeftIcon, BoxIcon, ListChecksIcon, MapIcon, PencilIcon, PlugIcon, ShoppingCartIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { currentLocale } from "@/lib/i18n";
import { FloorPlanThumbnail } from "../components/floor-plan-thumbnail";
import { PlaceFormDialog } from "../components/place-form-dialog";
import { formatArea } from "../components/place-format";
import type { PlacesActionResult } from "../data/places-loaders";
import { isOutside, type PlaceDetail } from "../types/places";

type LinkedSectionKey = "tasks" | "stock" | "shopping" | "appliances";

type PlaceDetailScreenProps = {
  detail: PlaceDetail;
  /** Adults and owners edit and delete; children only look. */
  canManage: boolean;
  /**
   * Content for the "what lives here" sections, supplied by other features through the route
   * (tasks, stock, shopping, appliances). Places never imports those features; an empty slot shows its empty text.
   */
  sections?: Partial<Record<LinkedSectionKey, React.ReactNode>>;
};

/** What hangs off a place. Each feature fills its own section via the `sections` prop. */
const LINKED_SECTIONS: { key: LinkedSectionKey; icon: LucideIcon }[] = [
  { key: "tasks", icon: ListChecksIcon },
  { key: "stock", icon: BoxIcon },
  { key: "shopping", icon: ShoppingCartIcon },
  { key: "appliances", icon: PlugIcon },
];

/** One room or zone: what lives here, and where it is on the plan. */
export function PlaceDetailScreen({ detail, canManage, sections = {} }: PlaceDetailScreenProps) {
  const { t } = useTranslation("places");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<PlacesActionResult>();
  const { place, plan, floors } = detail;
  const planHref = `/places/floors/${place.floorId}/plan`;

  const actions = canManage && (
    <>
      <PlaceFormDialog
        floors={floors}
        place={place}
        trigger={
          <Button variant="outline">
            <PencilIcon />
            {tCommon("actions.edit")}
          </Button>
        }
      />
      <ConfirmDialog
        trigger={
          <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={fetcher.state !== "idle"}>
            <Trash2Icon />
            {tCommon("actions.delete")}
          </Button>
        }
        title={t("place.delete.title", { name: place.name })}
        description={t("place.delete.description")}
        confirmLabel={tCommon("actions.delete")}
        cancelLabel={tCommon("actions.cancel")}
        destructive
        onConfirm={() =>
          fetcher.submit({ intent: "delete-place", id: place.id, redirectTo: "/places" }, { method: "post" })
        }
      />
    </>
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link to="/places" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("page.title")}
          </Link>
        }
        title={place.icon ? `${place.icon} ${place.name}` : place.name}
        description={`${place.floorName} · ${isOutside(place) ? t("location.outside") : t("location.inside")}`}
        actions={actions}
      />

      <PageGrid columns="main-sidebar">
        <PageSection aria-labelledby="place-contents">
          <SectionHeader id="place-contents" title={t("detail.contentsTitle")} description={t("detail.contentsDescription")} />
          <PageGrid columns="2" className="gap-4">
            {LINKED_SECTIONS.map(({ key, icon: Icon }) => (
              <Card key={key} className="gap-2">
                <CardHeader className="justify-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <CardTitle>{t(`detail.sections.${key}.title`)}</CardTitle>
                    {!sections[key] && <CardDescription>{t(`detail.sections.${key}.empty`)}</CardDescription>}
                  </div>
                </CardHeader>
                {sections[key]}
              </Card>
            ))}
          </PageGrid>
        </PageSection>

        <PageSection aria-labelledby="place-plan">
          <SectionHeader id="place-plan" title={t("detail.planTitle")} />
          <Card>
            {place.polygon ? (
              <>
                <div className="overflow-hidden rounded-lg border bg-background p-2">
                  <FloorPlanThumbnail
                    places={plan.places}
                    elements={plan.elements}
                    highlightId={place.id}
                    north={plan.north ?? null}
                    label={t("detail.planLabel", { name: place.name, floor: plan.floor.name })}
                    className="max-h-72"
                  />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">{t("fields.floor")}</dt>
                  <dd className="text-right font-medium">{plan.floor.name}</dd>
                  <dt className="text-muted-foreground">{t("fields.area")}</dt>
                  <dd className="text-right font-medium">{place.areaM2 !== null && formatArea(place.areaM2, currentLocale())}</dd>
                </dl>
              </>
            ) : (
              <CardDescription>{t("detail.notDrawn", { floor: plan.floor.name })}</CardDescription>
            )}
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link to={planHref}>
                <MapIcon />
                {place.polygon || !canManage ? t("floor.openPlan") : t("detail.drawOnPlan")}
              </Link>
            </Button>
          </Card>
        </PageSection>
      </PageGrid>
    </PageContainer>
  );
}
