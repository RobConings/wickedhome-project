import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import * as React from "react";
import { ExternalLinkIcon, MailIcon, ReplyIcon, Unlink2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { currentLocale } from "@/lib/i18n";
import { formatDateTime } from "@/types/date-format";
import { fetchProjectMailThreads, unlinkMailThread } from "../data/mail-requests";
import type { MailThreadInfo, ProjectMailThreads } from "../types/mail";

type ProjectMailThreadsProps = {
  projectId: string;
  /** Tests and stories pass the data; the page loads it itself. */
  initial?: ProjectMailThreads | null;
  load?: (projectId: string) => Promise<ProjectMailThreads>;
};

/**
 * A project's mails: the signed-in person's own Gmail threads linked to it (sent from the assistant or linked
 * there), newest first, with who wrote last and "Open in Gmail". Nothing for people without Gmail; nobody
 * ever sees someone else's mails. Composed into the project page by its route.
 */
export function ProjectMailThreadsPanel({ projectId, initial, load = fetchProjectMailThreads }: ProjectMailThreadsProps) {
  const { t } = useTranslation("integrations");
  const [data, setData] = React.useState<ProjectMailThreads | null>(initial ?? null);
  const [failed, setFailed] = React.useState(false);

  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (initial !== undefined) return;
    let current = true;
    load(projectId)
      .then((next) => {
        if (!current) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [initial, load, projectId, attempt]);

  const refresh = () => setAttempt((value) => value + 1);

  // People without Gmail (or children) don't get the section at all.
  if (!failed && (!data || !data.connected)) return null;

  const unlink = (thread: MailThreadInfo) =>
    unlinkMailThread(thread.id)
      .then(() => {
        setData((previous) => previous && { ...previous, threads: previous.threads.filter((entry) => entry.id !== thread.id) });
        toast.success(t("mail.project.unlinked"));
      })
      .catch(() => toast.error(t("mail.project.failed")));

  const details = (thread: MailThreadInfo) =>
    [
      thread.lastMessageAt && formatDateTime(thread.lastMessageAt, currentLocale()),
      thread.lastFromMe ? t("mail.project.waiting") : thread.lastFromName && t("mail.project.lastFrom", { name: thread.lastFromName }),
      thread.messageCount > 0 && t("mail.project.messages", { count: thread.messageCount }),
    ]
      .filter(Boolean)
      .join(" · ");

  const actions = (thread: MailThreadInfo) => (
    <Inline gap="xs" align="center" className="shrink-0">
      <Button asChild variant="ghost" size="icon" aria-label={t("mail.project.open")} title={t("mail.project.open")}>
        <a href={thread.gmailUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon />
        </a>
      </Button>
      <Button variant="ghost" size="icon" aria-label={t("mail.project.unlink")} title={t("mail.project.unlink")} onClick={() => void unlink(thread)}>
        <Unlink2Icon />
      </Button>
    </Inline>
  );

  const content = (thread: MailThreadInfo) => (
    <Inline gap="2.5" align="start" className="min-w-0">
      {thread.lastFromMe ? (
        <MailIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <ReplyIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      )}
      <Stack gap="0.5" className="min-w-0">
        <span className="text-sm font-medium break-words">{thread.subject}</span>
        {thread.counterpart && <span className="text-xs break-words text-muted-foreground">{thread.counterpart}</span>}
        <span className="text-xs text-muted-foreground">{details(thread)}</span>
      </Stack>
    </Inline>
  );

  return (
    <Card>
      <Stack gap="xs">
        <CardTitle>{t("mail.project.title")}</CardTitle>
        <CardDescription>{t("mail.project.description")}</CardDescription>
      </Stack>
      <GeneralList
        label={t("mail.project.label")}
        items={data?.threads ?? []}
        getKey={(thread) => thread.id}
        renderRow={(thread) => (
          <Inline gap="sm" align="start" justify="between" className="min-w-0">
            {content(thread)}
            {actions(thread)}
          </Inline>
        )}
        renderTile={(thread) => (
          <Card className="gap-3 p-4">
            {content(thread)}
            {actions(thread)}
          </Card>
        )}
        search={{ label: t("mail.project.search"), keys: (thread) => [thread.subject, thread.counterpart, thread.lastFromName] }}
        storageKey="project-mails"
        defaultView="list"
        loading={!data && !failed}
        error={failed ? t("mail.project.failed") : undefined}
        onRetry={refresh}
        emptyState={<EmptyState icon={MailIcon} title={t("mail.project.title")} description={t("mail.project.empty")} className="py-6" />}
      />
    </Card>
  );
}
