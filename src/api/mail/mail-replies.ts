import { featuresFromScopes } from "@/features/integrations/types/google";
import { errorText, withGoogle } from "../integrations/google-access";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { notify } from "../notifications/notify";
import { getThread, type GmailSession } from "./mail-gmail";
import { newReplies, threadState } from "./mail.service";
import { displayNameOf, headerOf, type GmailMessage } from "./mail-text";

/*
 * Replies to mails linked to projects (docs/NOTIFICATIONS.md): every ~10 minutes the linked threads of each
 * person are looked at in their own mailbox; a message from someone else that is newer than what was seen
 * becomes a `mail.reply` notification for that person only ("Jan replied about Badkamer renovatie").
 */

export const MAIL_REPLY_KIND = "mail.reply";

registerNotificationKind({
  id: MAIL_REPLY_KIND,
  group: "accounts",
  titleKey: "integrations:notifications.mailReply.title",
  descriptionKey: "integrations:notifications.mailReply.description",
  priority: "high",
  roles: ["owner", "adult"],
});

/** Threads quiet for longer than this are no longer checked (a new link or reply wakes them up). */
export const REPLY_WATCH_DAYS = 120;
/** At most this many threads per run (the oldest checked first next time). */
const MAX_THREADS_PER_RUN = 200;

export type ReplyNotice = { from: string; subject: string; snippet: string; projectName: string | null };

/** The notification text in the person's language. Pure. */
export function replyNotificationText(notice: ReplyNotice, count: number, locale: "en" | "nl") {
  const about = notice.projectName ?? notice.subject;
  const snippet = notice.snippet.length > 140 ? `${notice.snippet.slice(0, 139)}…` : notice.snippet;
  const body = [notice.projectName ? notice.subject : null, snippet ? `“${snippet}”` : null].filter(Boolean).join(" — ");
  if (locale === "nl") {
    return { title: count > 1 ? `${notice.from} antwoordde ${count} keer over ${about}` : `${notice.from} antwoordde over ${about}`, body: body || "Open de mail in Gmail." };
  }
  return { title: count > 1 ? `${notice.from} replied ${count} times about ${about}` : `${notice.from} replied about ${about}`, body: body || "Open the mail in Gmail." };
}

type LinkRow = {
  id: string;
  householdId: string;
  userId: string;
  gmailThreadId: string;
  projectId: string | null;
  subject: string;
  lastMessageAt: Date | null;
};

/** Checks one linked thread: stores what is newest, returns the new replies (oldest first). */
export async function checkThread(session: GmailSession, link: LinkRow): Promise<GmailMessage[]> {
  const thread = await getThread(session, link.gmailThreadId, "metadata");
  const messages = thread.messages ?? [];
  const replies = newReplies(messages, session.email, link.lastMessageAt);
  const state = threadState(messages, session.email);
  await db.mailThreadLink.update({
    where: { id: link.id },
    data: {
      messageCount: state.count,
      // Never move backwards (a deleted newest message must not make an old reply "new" again).
      lastMessageAt: state.lastAt && (!link.lastMessageAt || state.lastAt > link.lastMessageAt) ? state.lastAt : link.lastMessageAt,
      lastFromName: state.lastFromName,
      lastFromMe: state.lastFromMe,
      lastCheckedAt: new Date(),
      checkError: null,
    },
  });
  return replies.sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));
}

/** Drops links whose person is gone, and project ids of deleted projects. */
async function pruneLinks(): Promise<void> {
  const links = await db.mailThreadLink.findMany({ select: { id: true, userId: true, projectId: true, contactId: true } });
  if (!links.length) return;
  const users = new Set((await db.user.findMany({ where: { id: { in: [...new Set(links.map((link) => link.userId))] } }, select: { id: true } })).map((user) => user.id));
  const projectIds = [...new Set(links.flatMap((link) => (link.projectId ? [link.projectId] : [])))];
  const projects = new Set((await db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } })).map((project) => project.id));
  const goneUsers = links.filter((link) => !users.has(link.userId)).map((link) => link.id);
  if (goneUsers.length) await db.mailThreadLink.deleteMany({ where: { id: { in: goneUsers } } });
  const goneProjects = links.filter((link) => users.has(link.userId) && link.projectId && !projects.has(link.projectId));
  for (const link of goneProjects) {
    if (link.contactId) await db.mailThreadLink.update({ where: { id: link.id }, data: { projectId: null } });
    else await db.mailThreadLink.delete({ where: { id: link.id } });
  }
}

/** The scheduled run: every linked thread of every person with Gmail, replies notified. */
export async function checkAllReplies({ signal, log }: { signal: AbortSignal; log: (line: string) => void }): Promise<{ checked: number; replies: number; failed: number }> {
  await pruneLinks();
  const since = new Date(Date.now() - REPLY_WATCH_DAYS * 86_400_000);
  const links = await db.mailThreadLink.findMany({
    where: { OR: [{ lastMessageAt: null }, { lastMessageAt: { gte: since } }] },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: MAX_THREADS_PER_RUN,
  });
  const byUser = new Map<string, typeof links>();
  for (const link of links) byUser.set(link.userId, [...(byUser.get(link.userId) ?? []), link]);

  let checked = 0;
  let replies = 0;
  let failed = 0;
  for (const [userId, userLinks] of byUser) {
    if (signal.aborted) break;
    const connection = await db.googleConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== "CONNECTED" || !featuresFromScopes(connection.scopes).includes("gmail")) continue;
    const session: GmailSession = { email: connection.googleAccountEmail.toLowerCase(), signal, call: (work) => withGoogle(connection, work) };
    const projectNames = new Map(
      (await db.project.findMany({ where: { id: { in: userLinks.flatMap((link) => (link.projectId ? [link.projectId] : [])) } }, select: { id: true, name: true } })).map((project) => [project.id, project.name]),
    );
    for (const link of userLinks) {
      if (signal.aborted) break;
      try {
        const found = await checkThread(session, link);
        checked += 1;
        if (!found.length) continue;
        replies += found.length;
        const latest = found[found.length - 1] as GmailMessage;
        const notice: ReplyNotice = {
          from: displayNameOf(headerOf(latest.payload, "From")),
          subject: headerOf(latest.payload, "Subject") || link.subject,
          snippet: (latest.snippet ?? "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
          projectName: link.projectId ? (projectNames.get(link.projectId) ?? null) : null,
        };
        await notify({
          householdId: link.householdId,
          kind: MAIL_REPLY_KIND,
          userIds: [userId],
          url: link.projectId ? `/projects/${link.projectId}` : null,
          tag: `mail-reply:${link.id}:${latest.id}`,
          content: (locale) => replyNotificationText(notice, found.length, locale),
        }).catch((error: unknown) => console.error("[notifications] mail.reply failed", error));
      } catch (error) {
        failed += 1;
        log(`A linked thread could not be checked: ${errorText(error)}`);
        await db.mailThreadLink.update({ where: { id: link.id }, data: { lastCheckedAt: new Date(), checkError: errorText(error) } }).catch(() => undefined);
      }
    }
  }
  return { checked, replies, failed };
}
