import * as React from "react";
import { WorkflowIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "./card";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { SkeletonList } from "./loading-state";
import { ApiRequestError } from "../lib/api-client";
import { automationsClient, type AutomationsClient } from "../data/automations-requests";
import type { AutomationJob, AutomationsOverview } from "../types/automations";
import { AutomationJobRow } from "./automation-job-row";

/** While a job runs, its state is fetched this often. */
const POLL_MS = 2_000;
/** Relative times ("5 minutes ago") refresh this often. */
const CLOCK_MS = 30_000;

type AutomationsSectionProps = {
  /**
   * The jobs, from the hosting route's loader: the data, or a deferred (un-awaited) promise of it, which
   * shows a skeleton until it resolves. `null` (loading failed) shows an error with Retry. Leave it out
   * and the section loads the jobs itself.
   */
  data?: AutomationsOverview | null | Promise<AutomationsOverview | null>;
  /** API access; stories pass a fake. */
  client?: AutomationsClient;
};

type PanelProps = { data?: AutomationsOverview | null; client: AutomationsClient };

type State = { status: "loading" } | { status: "error" } | { status: "ready"; overview: AutomationsOverview };

const initialState = (data: AutomationsOverview | null | undefined): State =>
  data ? { status: "ready", overview: data } : data === null ? { status: "error" } : { status: "loading" };

function AutomationsSkeleton() {
  const { t } = useTranslation("automations");
  return (
    <Card aria-busy="true" aria-label={t("section.loading")}>
      <SkeletonList rows={3} />
    </Card>
  );
}

function DeferredAutomations({ promise, client }: { promise: Promise<AutomationsOverview | null>; client: AutomationsClient }) {
  return <AutomationsPanel data={React.use(promise)} client={client} />;
}

/**
 * Settings section listing the app's automations (scheduled jobs): what each does and when, its last run,
 * a switch to pause it (optimistic) and "Run now" (busy until the run finishes, polling the job meanwhile).
 */
export function AutomationsSection({ data, client = automationsClient }: AutomationsSectionProps) {
  if (data instanceof Promise) {
    return (
      <React.Suspense fallback={<AutomationsSkeleton />}>
        <DeferredAutomations promise={data} client={client} />
      </React.Suspense>
    );
  }
  return <AutomationsPanel data={data} client={client} />;
}

function AutomationsPanel({ data, client }: PanelProps) {
  const { t } = useTranslation("automations");
  const { t: tCommon } = useTranslation();
  const [state, setState] = React.useState<State>(() => initialState(data));
  const [reloads, setReloads] = React.useState(0);
  const [starting, setStarting] = React.useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = React.useState(() => Date.now());
  /** Runs started from this screen: their result gets a toast. */
  const startedHere = React.useRef(new Set<string>());

  // New loader data (revalidation after another section's save) replaces ours, during render.
  const [previousData, setPreviousData] = React.useState(data);
  if (data !== previousData) {
    setPreviousData(data);
    if (data !== undefined) setState(initialState(data));
  }

  // Self-loading when no data was passed, and on Retry.
  React.useEffect(() => {
    if (data !== undefined && reloads === 0) return;
    let cancelled = false;
    client
      .list()
      .then((overview) => {
        if (!cancelled) setState({ status: "ready", overview });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [client, data, reloads]);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  const jobs = state.status === "ready" ? state.overview.jobs : [];

  const replaceJob = React.useCallback((job: AutomationJob) => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, overview: { ...current.overview, jobs: current.overview.jobs.map((item) => (item.id === job.id ? job : item)) } }
        : current,
    );
  }, []);

  // Poll the jobs that are running until they're done; then report the outcome of runs started here.
  const runningIds = jobs
    .filter((job) => job.running)
    .map((job) => job.id)
    .join(",");
  const [pollTick, setPollTick] = React.useState(0);
  React.useEffect(() => {
    if (!runningIds) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // A failed request just waits for the next tick; the run itself goes on server-side.
      void Promise.all(runningIds.split(",").map((id) => client.get(id).catch(() => null))).then((results) => {
        if (cancelled) return;
        for (const job of results) {
          if (!job) continue;
          replaceJob(job);
          if (job.running || !startedHere.current.delete(job.id)) continue;
          const latest = job.recentRuns[0];
          const title = t(job.titleKey);
          if (latest?.status === "failed") toast.error(t("toast.failed", { title }), { description: latest.error ?? undefined });
          else if (latest?.status === "skipped") toast.warning(t("toast.skipped", { title }));
          else toast.success(t("toast.done", { title }), { description: latest?.summary ?? undefined });
        }
        setNow(Date.now());
        setPollTick((value) => value + 1);
      });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runningIds, pollTick, client, replaceJob, t]);

  async function toggle(job: AutomationJob, enabled: boolean) {
    const title = t(job.titleKey);
    replaceJob({ ...job, enabled, nextRunAt: enabled ? job.nextRunAt : null });
    try {
      replaceJob(await client.setEnabled(job.id, enabled));
      toast.success(enabled ? t("toast.resumed", { title }) : t("toast.paused", { title }));
    } catch {
      replaceJob(job);
      toast.error(t("toast.toggleFailed", { title }));
    }
  }

  async function run(job: AutomationJob) {
    const title = t(job.titleKey);
    setStarting((current) => new Set(current).add(job.id));
    try {
      const started = await client.run(job.id);
      startedHere.current.add(job.id);
      replaceJob({ ...started, running: true });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) toast.info(t("toast.alreadyRunning", { title }));
      else toast.error(t("toast.runFailed", { title }));
    } finally {
      setStarting((current) => {
        const next = new Set(current);
        next.delete(job.id);
        return next;
      });
    }
  }

  if (state.status === "loading") return <AutomationsSkeleton />;

  if (state.status === "error") {
    return (
      <Card>
        <ErrorState
          className="py-8"
          title={t("section.error")}
          description={t("section.errorDescription")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setState({ status: "loading" });
                setReloads((value) => value + 1);
              }}
            >
              {tCommon("actions.retry")}
            </Button>
          }
        />
      </Card>
    );
  }

  const { canManage } = state.overview;
  if (jobs.length === 0) {
    return <EmptyState icon={WorkflowIcon} title={t("section.empty.title")} description={t("section.empty.description")} />;
  }

  return (
    <Card>
      {!canManage && <p className="text-sm text-muted-foreground">{t("section.readOnly")}</p>}
      <ul className="flex flex-col divide-y">
        {jobs.map((job) => (
          <AutomationJobRow
            key={job.id}
            job={job}
            canManage={canManage}
            now={now}
            starting={starting.has(job.id)}
            onEnabledChange={(enabled) => void toggle(job, enabled)}
            onRun={() => void run(job)}
          />
        ))}
      </ul>
    </Card>
  );
}
