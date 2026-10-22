import type { CalendarOverlayItem } from "@/features/calendar/types/calendar";
import { projectPath } from "@/types/projects";
import { db, type ProjectStatus as ProjectStatusRow } from "../lib/db";
import type { CalendarSource } from "../calendar/calendar-sources";

type CalendarProject = {
  id: string;
  name: string;
  color: string;
  status: ProjectStatusRow;
  startDate: string | null;
  endDate: string | null;
};

/**
 * Projects with dates as all-day bars from the start to the end date (or on the start date alone), within
 * [from, to]. Cancelled projects are left out.
 */
export function projectCalendarItems(projects: CalendarProject[], from: string, to: string): CalendarOverlayItem[] {
  return projects.flatMap((project) => {
    if (!project.startDate || project.status === "CANCELLED") return [];
    const end = project.endDate && project.endDate >= project.startDate ? project.endDate : project.startDate;
    if (project.startDate > to || end < from) return [];
    return [
      {
        id: project.id,
        kind: "other" as const,
        title: project.name,
        allDay: true,
        start: project.startDate,
        end,
        color: project.color,
        href: projectPath(project.id),
        meta: { status: project.status.toLowerCase() },
      },
    ];
  });
}

const fromDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** Calendar source `projects`: projects with dates. Registered by projects.routes.ts. */
export const projectsCalendarSource: CalendarSource = {
  id: "projects",
  kind: "other",
  labelKey: "projects:calendarSource",
  async load({ householdId, from, to }) {
    const rows = await db.project.findMany({
      where: { householdId, startDate: { not: null, lte: new Date(`${to}T00:00:00Z`) }, status: { not: "CANCELLED" } },
      select: { id: true, name: true, color: true, status: true, startDate: true, endDate: true },
    });
    return projectCalendarItems(
      rows.map((row) => ({ ...row, startDate: fromDate(row.startDate), endDate: fromDate(row.endDate) })),
      from,
      to,
    );
  },
};
