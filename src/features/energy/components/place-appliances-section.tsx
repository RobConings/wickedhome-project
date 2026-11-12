import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { RecordLink } from "@/components/shared/record-link";
import * as React from "react";
import { GaugeIcon, PlugZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/shared/loading-state";
import { currentLocale } from "@/lib/i18n";
import { fetchAppliances } from "../data/energy-requests";
import type { Appliance } from "../types/energy";
import { ApplianceCategoryIcon } from "./appliance-category-icon";
import { formatWatts } from "./energy-format";

type PlaceAppliancesSectionProps = {
  placeId: string;
  /** All household appliances instead of fetching them (stories, tests). */
  initialData?: Appliance[];
};

type State = { status: "loading" } | { status: "error" } | { status: "ready"; appliances: Appliance[] };

/**
 * The appliances in one room or zone, for the place detail page: category, rated power and whether a
 * meter measures them. Loads its own data and renders content only, so the place page wraps it in its
 * own card. Managing appliances happens on the appliances page.
 */
export function PlaceAppliancesSection({ placeId, initialData }: PlaceAppliancesSectionProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const [state, setState] = React.useState<State>(() =>
    initialData ? { status: "ready", appliances: initialData } : { status: "loading" },
  );
  const [reloads, setReloads] = React.useState(0);

  React.useEffect(() => {
    if (initialData && reloads === 0) return;
    let cancelled = false;
    fetchAppliances()
      .then((appliances) => {
        if (!cancelled) setState({ status: "ready", appliances });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloads, initialData]);

  if (state.status === "loading") {
    return (
      <Stack gap="sm"  aria-busy="true">
        <span className="sr-only" role="status">
          {t("loading.appliances")}
        </span>
        <div className="rounded-xl border bg-card px-3">
          <SkeletonList rows={2} />
        </div>
      </Stack>
    );
  }

  if (state.status === "error") {
    return (
      <Stack gap="sm" align="start">
        <Text size="sm" tone="muted">{t("appliances.place.error")}</Text>
        <Button variant="outline" size="sm" onClick={() => setReloads((value) => value + 1)}>
          {t("appliances.place.retry")}
        </Button>
      </Stack>
    );
  }

  const here = state.appliances
    .filter((appliance) => appliance.placeId === placeId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Stack gap="sm">
      {here.length === 0 ? (
        <Text size="sm" tone="muted">{t("appliances.place.empty")}</Text>
      ) : (
        <ul className="divide-y rounded-xl border bg-card px-3">
          {here.map((appliance) => (
            <li key={appliance.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
                <ApplianceCategoryIcon category={appliance.category} />
              </span>
              <Stack gap="none" className="min-w-0 flex-1">
                <RecordLink to={`/energy/appliances/${encodeURIComponent(appliance.id)}`} className="min-h-11 truncate py-2 text-sm font-medium hover:underline">{appliance.name}</RecordLink>
                <span className="truncate text-xs text-muted-foreground">
                  {[
                    t(`categories.${appliance.category}`),
                    appliance.ratedPowerW != null && t("appliances.rated", { power: formatWatts(appliance.ratedPowerW, locale) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Stack>
              {appliance.measured ? (
                <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                  <GaugeIcon aria-hidden="true" />
                  {t("appliances.measured")}
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  {t("appliances.notMeasured")}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="ghost" size="sm" className="self-start text-muted-foreground">
        <Link to="/energy/appliances">
          <PlugZapIcon />
          {here.length > 0 ? t("appliances.place.manage") : t("appliances.place.add")}
        </Link>
      </Button>
    </Stack>
  );
}
