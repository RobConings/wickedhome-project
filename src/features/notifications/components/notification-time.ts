import { formatDate, formatTime, formatWeekday } from "@/types/date-format";

/** "5 minutes ago", "20:00" (today), "vr 20:00" (this week), "03/10/2026": short, in the person's language. */
export function formatNotificationTime(iso: string, locale: "en" | "nl", now = Date.now()): string {
  const at = new Date(iso);
  const minutes = Math.round((now - at.getTime()) / 60_000);
  const intl = locale === "nl" ? "nl-BE" : "en-BE";
  if (minutes < 60) return new Intl.RelativeTimeFormat(intl, { numeric: "auto" }).format(-Math.max(0, minutes), "minute");
  if (minutes < 24 * 60) return formatTime(at);
  if (minutes < 7 * 24 * 60) return `${formatWeekday(at, locale)} ${formatTime(at)}`;
  return formatDate(at, locale);
}
