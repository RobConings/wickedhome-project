import { CircleAlertIcon, CircleCheckIcon, CircleSlashIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { JobRunStatus } from "../types/automations";

const tone = {
  running: "info",
  succeeded: "success",
  failed: "danger",
  skipped: "neutral",
} as const satisfies Record<JobRunStatus, string>;

const icons = { succeeded: CircleCheckIcon, failed: CircleAlertIcon, skipped: CircleSlashIcon };

/** The outcome of a job run, as a small coloured badge with an icon (never colour alone). */
export function JobRunStatusBadge({ status, className }: { status: JobRunStatus; className?: string }) {
  const { t } = useTranslation("automations");
  const Icon = status === "running" ? null : icons[status];
  return (
    <Badge variant={tone[status]} className={className}>
      {Icon ? <Icon aria-hidden="true" /> : <Spinner className="size-3" />}
      {t(`status.${status}`)}
    </Badge>
  );
}
