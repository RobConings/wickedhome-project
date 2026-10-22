import { BellIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationBellProps = {
  /** Unread notifications; null while loading (no badge yet). */
  count: number | null;
  className?: string;
};

/** The bell in the app frame: opens the notification center, with the unread count as a badge. */
export function NotificationBell({ count, className }: NotificationBellProps) {
  const { t } = useTranslation("notifications");
  const unread = count ?? 0;
  const label = unread > 0 ? t("bell.unread", { count: unread }) : t("bell.label");
  return (
    <Button asChild variant="ghost" size="icon-lg" className={cn("relative", className)}>
      <Link to="/notifications" aria-label={label} title={label}>
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4.5 min-w-4.5 animate-appear items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
