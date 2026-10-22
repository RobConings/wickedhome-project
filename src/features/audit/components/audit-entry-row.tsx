import { BotIcon, MonitorSmartphoneIcon, PlugIcon, WorkflowIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shared/card";
import { currentLocale } from "@/lib/i18n";
import { formatDateTime } from "@/types/date-format";
import type { AuditChannel, AuditEntry } from "../types/audit";

const CHANNEL_ICONS: Record<AuditChannel, LucideIcon> = {
  app: MonitorSmartphoneIcon,
  assistant: BotIcon,
  mcp: PlugIcon,
  job: WorkflowIcon,
};

/**
 * The title of an entry: the translated action for actions the app writes itself, else (assistant and MCP
 * tool calls) the summary, which is the text the confirmation showed.
 */
function useEntryTitle() {
  const { t, i18n } = useTranslation("audit");
  return (entry: AuditEntry) => {
    const key = `audit:actions.${entry.action}`;
    if (i18n.exists(key)) return { title: t(key), detail: entry.summary };
    return { title: entry.summary ?? entry.action, detail: null };
  };
}

function when(at: string) {
  return formatDateTime(at, currentLocale());
}

function EntryMeta({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation("audit");
  const Icon = CHANNEL_ICONS[entry.channel];
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{entry.channel === "job" ? t("entry.job", { id: entry.actorName }) : entry.actorName}</span>
      <Badge variant="outline" className="gap-1">
        <Icon className="size-3" aria-hidden="true" />
        {t(`channels.${entry.channel}`)}
      </Badge>
      <time dateTime={entry.at}>{when(entry.at)}</time>
    </span>
  );
}

/** One activity in the list: what happened (and to what), who did it, through which channel, when. */
export function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const { title, detail } = useEntryTitle()(entry);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="leading-snug">
        <span className="font-medium">{title}</span>
        {entry.targetLabel && <span className="text-muted-foreground"> · {entry.targetLabel}</span>}
      </p>
      {detail && <p className="text-sm break-words text-muted-foreground">{detail}</p>}
      <EntryMeta entry={entry} />
    </div>
  );
}

/** The same activity as a tile. */
export function AuditEntryTile({ entry }: { entry: AuditEntry }) {
  const { title, detail } = useEntryTitle()(entry);
  return (
    <Card className="flex h-full flex-col gap-2">
      <p className="leading-snug font-medium">{title}</p>
      {entry.targetLabel && <p className="text-sm">{entry.targetLabel}</p>}
      {detail && <p className="text-sm break-words text-muted-foreground">{detail}</p>}
      <div className="mt-auto">
        <EntryMeta entry={entry} />
      </div>
    </Card>
  );
}
