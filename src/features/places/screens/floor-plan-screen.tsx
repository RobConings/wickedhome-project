import type { ComponentProps } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "../components/page-header";
import { FloorPlanEditor } from "../components/floor-plan-editor";
import type { FloorPlan } from "../types/places";

type FloorPlanScreenProps = {
  plan: FloorPlan;
  /** Adults and owners edit the plan; children only look. */
  canManage: boolean;
} & Pick<
  ComponentProps<typeof FloorPlanEditor>,
  "markers" | "selectedMarkerId" | "onMarkerClick" | "onMarkerMove" | "markerPalette" | "placingMarker" | "onPlacingCancel"
>;

/** One floor's plan, filling the screen below the app bar so the canvas gets as much room as possible. */
/** Markers and the marker palette (e.g. devices to place) are composed in by the route. */
export function FloorPlanScreen({ plan, canManage, ...markerProps }: FloorPlanScreenProps) {
  const { t } = useTranslation("places");
  const { floor } = plan;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[36rem] flex-col gap-4 px-4 py-4 sm:px-6 lg:h-dvh lg:px-8 lg:py-6">
      <PageHeader
        eyebrow={
          <Link to="/places" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("page.title")}
          </Link>
        }
        title={floor.name}
        description={floor.kind === "outdoor" ? t("editor.description.outdoor") : t("editor.description.indoor")}
      />
      {/* Keyed by floor: switching floors starts a fresh editor. */}
      <FloorPlanEditor key={floor.id} plan={plan} canManage={canManage} className="flex-1" {...markerProps} />
    </div>
  );
}
