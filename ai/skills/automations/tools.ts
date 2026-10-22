import { z } from "zod";
import { startJobNow } from "@/api/jobs/job-scheduler";
import { getAutomation, listAutomations, setAutomationEnabled } from "@/api/jobs/jobs.service";
import { describeSchedule, type ScheduleDescription } from "@/features/automations/types/schedule-description";
import type { AutomationJob, JobRun } from "@/features/automations/types/automations";
import type { Locale } from "@/types/common";
import { formatDateTime } from "@/types/date-format";
import { appText, capList, done, entityRef, registerAssistantSkill, registerAssistantTool, registerEntityResolver, say } from "@ai/core/kit";

/**
 * Skill "automations": the app's scheduled jobs (Settings › Automations): what runs when, the last run and its
 * outcome, and for owners and adults "run now" and pause/resume, exactly as the page offers. Jobs are code and
 * app-wide; titles come from the app's own translations.
 */

const MANAGERS = ["owner", "adult"] as const;

registerAssistantSkill({
  id: "automations",
  title: { en: "Automations", nl: "Automatiseringen" },
  summary: "Scheduled jobs (waste calendar sync, Google sync, auto-pay, clean-ups): schedule, last run, run now, pause or resume.",
  keywords: {
    nl: ["automatisering", "automatiseringen", "geplande taak", "achtergrondtaak", "job", "jobs", "laatst gelopen", "nu uitvoeren", "synchronisatie", "pauzeren"],
    en: ["automation", "automations", "scheduled job", "background job", "job", "jobs", "last run", "run now", "cron", "pause"],
  },
});

const titleOf = (job: Pick<AutomationJob, "id" | "titleKey">, locale: Locale) => appText(job.titleKey, locale) ?? job.id;

registerEntityResolver({
  type: "automation",
  label: "automation",
  skill: "automations",
  list: async (ctx) =>
    (await listAutomations()).map((job) => ({
      id: job.id,
      name: titleOf(job, ctx.locale),
      aliases: [job.id, job.id.replace(/[.-]/g, " "), titleOf(job, ctx.locale === "nl" ? "en" : "nl")],
      hint: job.enabled ? undefined : "paused",
    })),
});

const pad = (value: number) => String(value).padStart(2, "0");
const DAYS = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], nl: ["zo", "ma", "di", "wo", "do", "vr", "za"] } as const;

/** The schedule in a few words, like the page ("every day at 05:15"). */
function scheduleText(expression: string, locale: Locale): string {
  const s: ScheduleDescription = describeSchedule(expression);
  const nl = locale === "nl";
  switch (s.kind) {
    case "everyMinutes":
      return nl ? `elke ${s.interval} min` : `every ${s.interval} min`;
    case "hourly":
      return nl ? `elk uur om :${pad(s.minute)}` : `hourly at :${pad(s.minute)}`;
    case "everyHours":
      return nl ? `elke ${s.interval} uur om :${pad(s.minute)}` : `every ${s.interval} h at :${pad(s.minute)}`;
    case "daily":
      return nl ? `elke dag om ${s.times.join(", ")}` : `every day at ${s.times.join(", ")}`;
    case "weekdays":
      return nl ? `werkdagen om ${s.times.join(", ")}` : `weekdays at ${s.times.join(", ")}`;
    case "weekly":
      return `${s.days.map((index) => DAYS[locale][index]).join(", ")} ${nl ? "om" : "at"} ${s.times.join(", ")}`;
    case "monthly":
      return nl ? `de ${s.day}e van de maand om ${s.times.join(", ")}` : `day ${s.day} of the month at ${s.times.join(", ")}`;
    case "custom":
      return s.expression;
  }
}

const when = (iso: string | null | undefined, locale: Locale) => (iso ? formatDateTime(iso, locale) : null);
const runText = (run: JobRun | null, locale: Locale) =>
  run ? `${run.status} ${when(run.finishedAt ?? run.startedAt, locale)}${run.error ? `: ${run.error.slice(0, 160)}` : run.summary ? `: ${run.summary.slice(0, 160)}` : ""}` : "never";

registerAssistantTool({
  name: "automations.list",
  description: "The scheduled jobs with schedule, on or paused, next run and last run (ok/failed and its summary). With `job`: that one with its recent runs.",
  input: z.object({ job: entityRef("automation", "Job by name, e.g. 'afvalkalender', 'Gmail'").optional() }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the automations", nl: "Automatiseringen bekeken" },
  run: async (ctx, input) => {
    const row = (job: AutomationJob) => ({
      job: titleOf(job, ctx.locale),
      schedule: scheduleText(job.schedule, ctx.locale),
      paused: job.enabled ? null : true,
      running: job.running || null,
      next: when(job.nextRunAt, ctx.locale),
      last: runText(job.lastRun, ctx.locale),
    });
    if (input.job) {
      const job = await getAutomation(input.job.id);
      return { ...row(job), recent: job.recentRuns.slice(0, 5).map((run) => `${run.trigger}: ${runText(run, ctx.locale)}`) };
    }
    const jobs = await listAutomations();
    return { ...capList(jobs, 30, row), failing: jobs.filter((job) => job.lastRun?.status === "failed").map((job) => titleOf(job, ctx.locale)) };
  },
});

registerAssistantTool({
  name: "automations.run",
  description: "Start a scheduled job right now (it runs in the background; check the outcome with automations_list).",
  input: z.object({ job: entityRef("automation", "Job by name") }),
  permission: "write",
  confirm: "first-time",
  roles: MANAGERS,
  activity: { en: "Started an automation", nl: "Automatisering gestart" },
  describe: (ctx, input) => say(ctx.locale, `Run “${input.job.name}” now`, `“${input.job.name}” nu uitvoeren`),
  run: async (_ctx, input) => {
    const before = await getAutomation(input.job.id);
    if (before.running) return done(`“${input.job.name}” is already running.`);
    startJobNow(input.job.id);
    return done(`Started “${input.job.name}”; it runs in the background (ask again in a minute for the outcome).`);
  },
});

registerAssistantTool({
  name: "automations.set_enabled",
  description: "Pause (enabled false) or resume (enabled true) a scheduled job. A paused job can still be run by hand.",
  input: z.object({ job: entityRef("automation", "Job by name"), enabled: z.boolean() }),
  permission: "write",
  confirm: "always",
  roles: MANAGERS,
  activity: { en: "Paused or resumed an automation", nl: "Automatisering gepauzeerd of hervat" },
  describe: (ctx, input) =>
    input.enabled ? say(ctx.locale, `Resume “${input.job.name}”`, `“${input.job.name}” hervatten`) : say(ctx.locale, `Pause “${input.job.name}”`, `“${input.job.name}” pauzeren`),
  run: async (ctx, input) => {
    const job = await setAutomationEnabled(input.job.id, input.enabled);
    return done(job.enabled ? `“${input.job.name}” is on again; next run ${when(job.nextRunAt, ctx.locale) ?? "–"}.` : `“${input.job.name}” is paused.`);
  },
});
