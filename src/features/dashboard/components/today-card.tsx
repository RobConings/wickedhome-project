import { ArrowRightIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/shared/card";
import type { IconChipTone } from "@/components/shared/icon-chip";
import { InlineAlert } from "@/components/shared/inline-alert";
import { TimelineList } from "@/components/shared/timeline-list";
import { CalendarEntryIcon, type CalendarAgenda, type CalendarEntryKind } from "@/features/calendar";
import type { TasksSummary } from "@/features/tasks";
import { todayItems } from "../data/dashboard-items";

const KIND_TONES: Record<CalendarEntryKind, IconChipTone> = {
  event: "calendar",
  store_visit: "shopping",
  birthday: "highlight",
  task: "tasks",
  bill: "finance",
  renewal: "finance",
  waste: "home",
  other: "neutral",
};

type TodayCardProps = {
  today: string;
  /** `null` when the calendar failed to load. */
  agenda: CalendarAgenda | null;
  /** `null` when tasks failed to load. */
  tasks: TasksSummary | null;
};

/** Today's timeline: calendar entries and tasks due today, all-day items first. */
export function TodayCard({ today, agenda, tasks }: TodayCardProps) {
  const { t } = useTranslation("dashboard");
  const items = todayItems(today, agenda, tasks);
  const failed = !agenda && !tasks;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("today.title")}</CardTitle>
      </CardHeader>

      {failed ? (
        <InlineAlert tone="error">{t("loadError")}</InlineAlert>
      ) : (
        <>
          {!agenda && <InlineAlert tone="error">{t("today.calendarError")}</InlineAlert>}
          {!tasks && <InlineAlert tone="error">{t("today.tasksError")}</InlineAlert>}
          {items.length > 0 ? (
            <TimelineList
              items={items.map((item) => ({
                id: item.id,
                time: item.time ?? (item.ongoing ? t("today.ongoing") : t("today.allDay")),
                icon: <CalendarEntryIcon kind={item.kind} />,
                tone: KIND_TONES[item.kind],
                title: item.title,
                subtitle: item.age !== null ? t("today.age", { age: item.age }) : (item.detail ?? t(`today.kinds.${item.kind}`)),
                href: item.href,
              }))}
            />
          ) : (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <SunIcon className="size-4" aria-hidden="true" />
              {t("today.empty")}
            </p>
          )}
        </>
      )}

      <CardFooter>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to="/calendar">
            {t("today.viewCalendar")}
            <ArrowRightIcon />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
