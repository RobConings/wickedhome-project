import { CalendarClockIcon, HouseIcon, MapPinIcon, ShapesIcon, TreesIcon, UsersIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SegmentedControl } from "./segmented-control";
import type { Habitant } from "@/features/household";
import { TASK_TYPES, type TaskLocation, type TaskType } from "../types/tasks";
import { TASK_TYPE_ICONS } from "./task-type-icons";
import { TASK_VIEWS, type TaskFilters, type TaskGrouping, type TaskView } from "../types/task-views";

type TaskFiltersBarProps = {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  /** Number of tasks per view, for the tab badges. */
  counts: Record<TaskView, number>;
  habitants: Habitant[];
  /** Name of the place in `filters.place`, shown as a removable chip. */
  placeName?: string | null;
  /** Hide "Mine" for users without a habitant. */
  showMine?: boolean;
};

const EVERYONE = "everyone";
const ALL_TYPES = "all";

/**
 * Views (mine, all, ready, overdue, done) as tabs, then who, type, inside/outside and grouping. The tasks
 * page uses the two parts on their own: the tabs above its list, the controls in the list's toolbar.
 */
export function TaskFiltersBar(props: TaskFiltersBarProps) {
  return (
    <div className="flex flex-col gap-3">
      <TaskViewTabs {...props} />
      <TaskFilterControls {...props} />
    </div>
  );
}

/** The views (mine, all, ready, overdue, done) as tabs with their counts. */
export function TaskViewTabs({ filters, onChange, counts, showMine = true }: Pick<TaskFiltersBarProps, "filters" | "onChange" | "counts" | "showMine">) {
  const { t } = useTranslation("tasks");
  const views = TASK_VIEWS.filter((view) => showMine || view !== "mine");
  return (
    <Tabs value={filters.view} onValueChange={(view) => onChange({ ...filters, view: view as TaskView })}>
      <TabsList className="max-w-full justify-start overflow-x-auto">
        {views.map((view) => (
          <TabsTrigger key={view} value={view}>
            {t(`views.${view}`)}
            {counts[view] > 0 && view !== "done" && (
              <Badge variant={view === "overdue" ? "destructive" : "secondary"} className="tabular-nums">
                {counts[view]}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Who, type, inside/outside, grouping, and the chosen place as a removable chip. */
export function TaskFilterControls({ filters, onChange, habitants, placeName }: Pick<TaskFiltersBarProps, "filters" | "onChange" | "habitants" | "placeName">) {
  const { t } = useTranslation("tasks");
  const update = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.assignee ?? EVERYONE} onValueChange={(value) => update({ assignee: value === EVERYONE ? null : value })}>
        <SelectTrigger size="sm" className="min-w-0 flex-[1_1_9rem] sm:w-44 sm:flex-none" aria-label={t("filters.assignee")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EVERYONE}>{t("filters.everyone")}</SelectItem>
          {habitants.map((habitant) => (
            <SelectItem key={habitant.id} value={habitant.id}>
              {habitant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.type ?? ALL_TYPES} onValueChange={(value) => update({ type: value === ALL_TYPES ? null : (value as TaskType) })}>
        <SelectTrigger size="sm" className="min-w-0 flex-[1_1_9rem] sm:w-40 sm:flex-none" aria-label={t("filters.type")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES}>{t("filters.allTypes")}</SelectItem>
          {TASK_TYPES.map((type) => {
            const Icon = TASK_TYPE_ICONS[type];
            return (
              <SelectItem key={type} value={type}>
                <Icon aria-hidden="true" />
                {t(`types.${type}`)}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <SegmentedControl<"all" | TaskLocation>
        label={t("filters.location")}
        size="sm"
        options={[
          { value: "all", label: t("filters.anywhere") },
          { value: "inside", label: t("filters.inside"), icon: HouseIcon },
          { value: "outside", label: t("filters.outside"), icon: TreesIcon },
        ]}
        value={filters.location ?? "all"}
        onChange={(value) => update({ location: value === "all" ? null : value })}
      />

      <SegmentedControl<TaskGrouping>
        label={t("filters.group")}
        size="sm"
        iconOnly
        options={[
          { value: "due", label: t("filters.groupDue"), icon: CalendarClockIcon },
          { value: "place", label: t("filters.groupPlace"), icon: MapPinIcon },
          { value: "type", label: t("filters.groupType"), icon: ShapesIcon },
          { value: "assignee", label: t("filters.groupAssignee"), icon: UsersIcon },
        ]}
        value={filters.group}
        onChange={(group) => update({ group })}
        className="sm:ml-auto"
      />

      {filters.place && (
        <Button variant="secondary" size="xs" onClick={() => update({ place: null })} aria-label={t("filters.clearPlace")}>
          <MapPinIcon />
          {placeName ?? t("filters.onePlace")}
          <XIcon />
        </Button>
      )}
    </div>
  );
}
