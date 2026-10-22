import { AlarmClockIcon, CircleUserRoundIcon, ListTodoIcon, PackageIcon, PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatTile } from "@/components/shared/stat-tile";
import { dueState, onDutyIds, type Task } from "../types/tasks";

type TaskStatsProps = {
  tasks: Task[];
  today: string;
  /** Shows "Mine" instead of "Open" when the user has a habitant. */
  currentHabitantId?: string | null;
};

/** Key figures of the open tasks: mine (or all open), overdue, ready to start, waiting for materials. */
export function TaskStats({ tasks, today, currentHabitantId }: TaskStatsProps) {
  const { t } = useTranslation("tasks");
  const open = tasks.filter((task) => task.status === "open");
  const overdue = open.filter((task) => dueState(task, today) === "overdue").length;
  const dueToday = open.filter((task) => dueState(task, today) === "today").length;
  const ready = open.filter((task) => task.readiness === "ready").length;
  const waiting = open.filter((task) => task.readiness === "waiting").length;
  const mine = currentHabitantId ? open.filter((task) => onDutyIds(task).includes(currentHabitantId)).length : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {mine !== null ? (
        <StatTile label={t("stats.mine")} value={mine} hint={t("stats.openTotal", { count: open.length })} icon={CircleUserRoundIcon} tone="featured" />
      ) : (
        <StatTile label={t("stats.open")} value={open.length} icon={ListTodoIcon} tone="featured" />
      )}
      <StatTile
        label={t("stats.overdue")}
        value={overdue}
        hint={t("stats.dueToday", { count: dueToday })}
        icon={AlarmClockIcon}
        tone={overdue > 0 ? "negative" : dueToday > 0 ? "soon" : "positive"}
      />
      <StatTile label={t("stats.ready")} value={ready} icon={PlayIcon} tone={ready > 0 ? "positive" : "default"} />
      <StatTile label={t("stats.waiting")} value={waiting} icon={PackageIcon} tone={waiting > 0 ? "warning" : "default"} />
    </div>
  );
}
