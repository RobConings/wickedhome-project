import * as React from "react";
import { BellIcon, CheckCheckIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { useLiveEvents } from "@/lib/live-events";
import { LIVE_READY_EVENT } from "@/types/live-events";
import { NotificationRow, NotificationTile } from "../components/notification-row";
import { notificationsClient, type NotificationsClient } from "../data/notifications-requests";
import { setUnreadNotificationCount } from "../data/use-unread-notifications";
import { NOTIFICATIONS_CHANGED_EVENT, type NotificationItem, type NotificationsChangedEvent, type NotificationsPage } from "../types/notifications";

type Show = "all" | "unread";

type NotificationsScreenProps = {
  /** The signed-in person: live updates are for them. */
  userId: string;
  /** API access; stories pass a fake. */
  client?: NotificationsClient;
  /** Reload on live events (off in Storybook). */
  live?: boolean;
  /** Clock for relative times (stories). */
  now?: number;
};

/**
 * `/notifications`: the person's notification center, newest first. Tapping one marks it read and opens its
 * page; "Mark all as read" clears the bell. New notifications appear live (SSE). Loads its own data.
 */
export function NotificationsScreen({ userId, client = notificationsClient, live = true, now }: NotificationsScreenProps) {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const [page, setPage] = React.useState<NotificationsPage | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);
  const [show, setShow] = React.useState<Show>("all");

  // Live reloads keep showing the current list until the new one is there (no spinner for a few rows).
  const reload = React.useCallback(() => {
    client
      .list({})
      .then((next) => {
        setPage(next);
        setFailed(false);
        setUnreadNotificationCount(next.unread);
      })
      .catch(() => setFailed(true));
  }, [client]);

  React.useEffect(() => reload(), [reload]);
  useLiveEvents<NotificationsChangedEvent>(
    NOTIFICATIONS_CHANGED_EVENT,
    (data) => {
      if (data.userIds.includes(userId)) reload();
    },
    { enabled: live },
  );
  useLiveEvents(LIVE_READY_EVENT, reload, { enabled: live });

  /** Optimistic: shows them read at once, rolls back with a toast when the server refuses. */
  async function markRead(ids?: string[]) {
    const previous = page;
    if (!previous) return;
    const at = new Date().toISOString();
    const items = previous.items.map((item) => (item.readAt === null && (!ids || ids.includes(item.id)) ? { ...item, readAt: at } : item));
    const unread = ids ? Math.max(0, previous.unread - previous.items.filter((item) => item.readAt === null && ids.includes(item.id)).length) : 0;
    setPage({ ...previous, items, unread });
    setUnreadNotificationCount(unread);
    try {
      const result = await client.markRead(ids ? { ids } : {});
      setUnreadNotificationCount(result.unread);
    } catch {
      setPage(previous);
      setUnreadNotificationCount(previous.unread);
      toast.error(t("list.markFailed"));
    }
  }

  async function markAll() {
    setMarkingAll(true);
    await markRead();
    setMarkingAll(false);
  }

  function open(item: NotificationItem) {
    if (item.readAt === null) void markRead([item.id]);
    if (item.url) void navigate(item.url);
  }

  async function loadMore() {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await client.list({ cursor: page.nextCursor });
      setPage((current) => (current ? { ...current, items: [...current.items, ...next.items], nextCursor: next.nextCursor } : current));
    } catch {
      toast.error(t("list.moreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  const items = (page?.items ?? []).filter((item) => show === "all" || item.readAt === null);
  const unread = page?.unread ?? 0;
  const pressable = (item: NotificationItem, content: React.ReactNode) => (
    <button
      type="button"
      onClick={() => open(item)}
      className="-m-1 block w-[calc(100%+0.5rem)] rounded-md p-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {content}
    </button>
  );

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/settings#notifications">
                <SettingsIcon />
                {t("list.settings")}
              </Link>
            </Button>
            <Button onClick={() => void markAll()} loading={markingAll} disabled={unread === 0}>
              <CheckCheckIcon />
              {t("list.markAllRead")}
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        <GeneralList<NotificationItem>
          label={t("list.label")}
          items={items}
          getKey={(item) => item.id}
          renderRow={(item) => pressable(item, <NotificationRow notification={item} now={now} />)}
          renderTile={(item) => pressable(item, <NotificationTile notification={item} now={now} />)}
          search={{ keys: ["title", "body"], placeholder: t("list.search") }}
          storageKey="notifications"
          defaultView="list"
          toolbar={
            <SegmentedControl<Show>
              label={t("list.unreadOnly")}
              value={show}
              onChange={setShow}
              size="lg"
              options={[
                { value: "all", label: t("list.label") },
                { value: "unread", label: t("list.unreadOnly") },
              ]}
            />
          }
          filtered={show === "unread"}
          noResultsState={show === "unread" && (page?.items.length ?? 0) > 0 ? <EmptyState icon={CheckCheckIcon} title={t("list.allRead")} /> : undefined}
          loading={page === null && !failed}
          error={failed && page === null ? t("list.error") : undefined}
          onRetry={() => {
            setFailed(false);
            reload();
          }}
          emptyState={<EmptyState icon={BellIcon} title={t("empty.title")} description={t("empty.description")} />}
        />
        {page?.nextCursor && (
          <Button variant="outline" className="self-center" loading={loadingMore} onClick={() => void loadMore()}>
            {t("list.more")}
          </Button>
        )}
      </div>
    </PageContainer>
  );
}
