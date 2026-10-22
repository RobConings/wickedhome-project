import { BanknoteIcon, BellIcon, CpuIcon, ListChecksIcon, MailIcon, ShieldAlertIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card } from "./card";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "../types/notifications";
import { formatNotificationTime } from "./notification-time";

/** An icon per sending feature (the kind's prefix); unknown kinds get the bell. */
export function NotificationKindIcon({ kind, className }: { kind: string; className?: string }) {
  switch (kind.split(".")[0]) {
    case "waste":
      return <Trash2Icon className={className} />;
    case "tasks":
      return <ListChecksIcon className={className} />;
    case "expenses":
    case "income":
      return <BanknoteIcon className={className} />;
    case "alarm":
    case "home-assistant":
      return <ShieldAlertIcon className={className} />;
    case "devices":
      return <CpuIcon className={className} />;
    case "integrations":
      return <MailIcon className={className} />;
    case "auth":
      return <UserPlusIcon className={className} />;
    default:
      return <BellIcon className={className} />;
  }
}

type NotificationRowProps = {
  notification: NotificationItem;
  /** Clock for the relative time (stories). */
  now?: number;
};

function Content({ notification, now }: NotificationRowProps) {
  const { t } = useTranslation("notifications");
  const unread = notification.readAt === null;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
          notification.urgent ? "bg-destructive/15 text-destructive" : unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        <NotificationKindIcon kind={notification.kind} className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={cn("min-w-0 flex-1 truncate", unread ? "font-semibold" : "font-medium text-muted-foreground")}>{notification.title}</p>
          <time dateTime={notification.createdAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatNotificationTime(notification.createdAt, currentLocale(), now)}
          </time>
        </div>
        {notification.body && <p className="line-clamp-2 text-sm text-muted-foreground">{notification.body}</p>}
        {(unread || notification.urgent) && (
          <div className="mt-1 flex gap-1.5">
            {notification.urgent && <Badge variant="destructive">{t("list.urgent")}</Badge>}
            {unread && (
              <Badge variant="secondary" className="gap-1">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {t("list.new")}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One notification in the center's list: icon per feature, title, two lines of body, time, unread mark. */
export function NotificationRow(props: NotificationRowProps) {
  return <Content {...props} />;
}

/** The same as a tile. */
export function NotificationTile(props: NotificationRowProps) {
  return (
    <Card className={cn("h-full p-3", props.notification.readAt === null && "border-primary/40")}>
      <Content {...props} />
    </Card>
  );
}
