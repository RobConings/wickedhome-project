import * as React from "react";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PendingContent } from "@/components/shared/loading-state";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { fetchTasksOverview } from "../data/tasks-requests";
import { compareTasks, type TasksOverview } from "../types/tasks";
import { TaskRow } from "./task-row";

/** At most this many open tasks; "View all" opens the tasks page filtered on the place. */
const MAX_SHOWN = 5;

type PlaceTasksSectionProps = {
  placeId: string;
  /** Data instead of fetching it (stories, tests). */
  initialData?: { overview: TasksOverview; habitants: Habitant[] };
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; overview: TasksOverview; habitants: Habitant[] };

/**
 * The open tasks of one room or zone, for the place detail page. Loads its own data, so the places
 * feature only renders `<PlaceTasksSection placeId={…} />`. Quick actions post to the tasks route.
 * Renders content only (like the stock, shopping and appliances sections): the place page wraps it in
 * its own card with the "Tasks" heading.
 */
export function PlaceTasksSection({ placeId, initialData }: PlaceTasksSectionProps) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const [state, setState] = React.useState<State>(() =>
    initialData ? { status: "ready", ...initialData } : { status: "loading" },
  );
  const [reloads, setReloads] = React.useState(0);
  // Reloading after a quick action: the list stays, faded, until the new one is in.
  const [refreshing, setRefreshing] = React.useState(false);
  const reload = React.useCallback(() => {
    setRefreshing(true);
    setReloads((value) => value + 1);
  }, []);
  const retry = () => {
    setState({ status: "loading" });
    setReloads((value) => value + 1);
  };

  React.useEffect(() => {
    if (initialData && reloads === 0) return;
    let cancelled = false;
    Promise.all([fetchTasksOverview({ placeId }), fetchHouseholdOverview()])
      .then(([overview, household]) => {
        if (!cancelled) setState({ status: "ready", overview, habitants: household.habitants });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [placeId, reloads, initialData]);

  const open = state.status === "ready" ? state.overview.tasks.filter((task) => task.status === "open").sort(compareTasks) : [];
  const canManage = state.status === "ready" && state.overview.viewer.canManage;
  const placeQuery = `place=${encodeURIComponent(placeId)}`;

  // Content only: the place page draws the card and the "Tasks" heading around it.
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" role={state.status === "loading" ? "status" : undefined}>
          {state.status === "ready"
            ? open.length > 0
              ? t("place.count", { count: open.length })
              : t("place.empty")
            : state.status === "error"
              ? t("place.error")
              : t("place.loading")}
        </p>
        {canManage && (
          <Button asChild variant="ghost" size="icon-sm" aria-label={t("place.add")} title={t("place.add")}>
            <Link to={`/tasks?new=1&${placeQuery}`}>
              <PlusIcon />
            </Link>
          </Button>
        )}
      </div>

      {state.status === "loading" && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}

      {state.status === "error" && (
        <Button variant="outline" size="sm" className="self-start" onClick={retry}>
          {t("place.retry")}
        </Button>
      )}

      {state.status === "ready" && open.length > 0 && (
        <>
          <PendingContent pending={refreshing} label={tCommon("loading.updating")}>
            <ul className="flex flex-col gap-2">
              {open.slice(0, MAX_SHOWN).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={state.overview.today}
                  habitants={state.habitants}
                  viewer={state.overview.viewer}
                  hidePlace
                  action="/tasks"
                  onChanged={reload}
                />
              ))}
            </ul>
          </PendingContent>
          <Button asChild variant="link" size="sm" className="self-start px-0">
            <Link to={`/tasks?view=all&${placeQuery}`}>
              {open.length > MAX_SHOWN ? t("place.viewAllCount", { count: open.length }) : t("place.viewAll")}
              <ArrowRightIcon />
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
