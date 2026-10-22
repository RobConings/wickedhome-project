import { ScrollTextIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { AlarmLogEntry } from "../types/home-assistant";
import { formatDateTime } from "./ha-format";

const RESULT_VARIANT = {
  succeeded: "success",
  failed: "danger",
  refused: "warning",
  rate_limited: "warning",
} as const satisfies Record<AlarmLogEntry["result"], string>;

/** Who armed or disarmed, when, and how it went (the audit log; codes are never stored). */
export function AlarmLogList({ entries }: { entries: AlarmLogEntry[] }) {
  const { t, i18n } = useTranslation("home-assistant");
  if (entries.length === 0) {
    return <EmptyState icon={ScrollTextIcon} title={t("alarm.log.empty.title")} description={t("alarm.log.empty.description")} className="py-8" />;
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">
              {t(`alarm.log.actions.${entry.action}`)} · {entry.actorName}
            </span>
            {entry.detail && <span className="truncate text-xs text-muted-foreground">{entry.detail}</span>}
          </span>
          <span className="flex items-center gap-2">
            <Badge variant={RESULT_VARIANT[entry.result]}>
              {t(`alarm.log.results.${entry.result}`)}
            </Badge>
            <time dateTime={entry.at} className="text-xs text-muted-foreground tabular-nums">
              {formatDateTime(entry.at, i18n.language)}
            </time>
          </span>
        </li>
      ))}
    </ul>
  );
}
