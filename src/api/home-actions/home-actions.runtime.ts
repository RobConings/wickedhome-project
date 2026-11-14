import { z } from "zod";
import { homeActionInputSchema, type ActionStepResult } from "@/features/home-actions/types/home-actions";
import { db, type Prisma } from "../lib/db";
import { publish } from "../lib/events";
import { getHaClient, getEntityState, haHouseholdId, onStatesLoaded } from "../home-assistant/ha-connection";
import { ACTION_EVENT, DISPATCHER_ENTITY } from "./home-action-compiler";
import { ACTIVE_RUNS, publishedAction } from "./home-actions.service";

const eventSchema = z.object({ action_id: z.string().min(1).max(100), revision: z.number().int().positive(), run_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), phase: z.enum(["started", "requested", "confirmed", "skipped", "failed", "completed", "blocked"]), index: z.number().int().min(-1).max(19) });
let queue: Promise<unknown> = Promise.resolve();
let stop: (() => void) | null = null;
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Native HA events are observations. Finished runs never revert to running when late events arrive. */
export async function recordActionProgress(data: unknown) {
  const parsed = eventSchema.safeParse(data);
  if (!parsed.success) return;
  const event = parsed.data, householdId = await haHouseholdId();
  if (!householdId) return;
  let run = await db.homeActionRun.findFirst({ where: { id: event.run_id, householdId, actionId: event.action_id, revision: event.revision } });
  if (!run && event.phase === "started" && event.run_id.startsWith("native-")) {
    const action = await db.homeAction.findFirst({ where: { id: event.action_id, householdId, archived: false, publishedRevision: event.revision } });
    const published = action && publishedAction(action);
    if (!published || published.definition.alarmMode) return;
    run = await db.homeActionRun.create({ data: { id: event.run_id, householdId, actionId: action.id, revision: event.revision, snapshot: asJson(published.definition), actorName: "Home Assistant", source: "automation", requestKey: event.run_id, status: "running" } });
  }
  if (!run || !ACTIVE_RUNS.includes(run.status)) return;
  const definition = homeActionInputSchema.parse(run.snapshot);
  const steps = [...run.steps as ActionStepResult[]];
  const at = new Date();
  let status = event.phase === "started" && definition.alarmMode ? "arming" : "running", finished = false;
  if (event.index >= 0) {
    const step = definition.steps[event.index];
    if (!step || !["requested", "confirmed", "skipped", "failed"].includes(event.phase)) return;
    const previous = steps.find((entry) => entry.index === event.index);
    if (previous && previous.status !== "requested") return;
    const result: ActionStepResult = { index: event.index, status: event.phase as ActionStepResult["status"], at: at.toISOString() };
    if (previous) steps[steps.indexOf(previous)] = result; else steps.push(result);
    if (event.phase === "failed" && (step.kind === "wait" || step.onFailure === "stop")) { status = "failed"; finished = true; }
  } else if (event.phase === "blocked") { status = "blocked"; finished = true; }
  else if (event.phase === "completed") {
    const allObserved = definition.steps.every((_, index) => steps.some((entry) => entry.index === index && entry.status !== "requested"));
    status = !allObserved ? "interrupted" : steps.some((entry) => entry.status === "failed") ? "partial" : "confirmed";
    finished = true;
  } else if (event.phase !== "started") return;
  await db.homeActionRun.updateMany({ where: { id: run.id, householdId, status: { in: ACTIVE_RUNS } }, data: { status, steps: asJson(steps), ...(finished ? { finishedAt: at } : {}) } });
  publish(householdId, "home_actions.changed", {});
}

async function reconcile() {
  const householdId = await haHouseholdId();
  if (!householdId || !getHaClient()?.connected) return;
  const idle = getEntityState(DISPATCHER_ENTITY)?.state !== "on";
  // Missing events/restarts are marked explicitly; no physical command is retried here.
  const result = await db.homeActionRun.updateMany({ where: { householdId, OR: [
    ...(idle ? [{ status: { in: ["requested", "running"] }, updatedAt: { lt: new Date(Date.now() - 30_000) } }] : []),
    { status: "arming", updatedAt: { lt: new Date(Date.now() - 150_000) } },
    { status: { in: ACTIVE_RUNS }, startedAt: { lt: new Date(Date.now() - 2 * 60 * 60_000) } },
  ] }, data: { status: "interrupted", detail: "The final state was not fully observed. Check devices before starting again.", finishedAt: new Date() } });
  if (result.count) publish(householdId, "home_actions.changed", {});
}

export function startHomeActionsRuntime() {
  if (stop) return;
  const unsubscribe = getHaClient()?.subscribeEvents(ACTION_EVENT, (event) => {
    queue = queue.then(() => recordActionProgress(event.data)).catch(() => console.error("[home-actions] could not store execution progress"));
  });
  const loaded = onStatesLoaded(() => { void reconcile().catch(() => console.error("[home-actions] reconciliation failed")); });
  const timer = setInterval(() => { void reconcile().catch(() => console.error("[home-actions] reconciliation failed")); }, 15_000);
  timer.unref();
  stop = () => { unsubscribe?.(); loaded(); clearInterval(timer); };
}
export async function stopHomeActionsRuntime() { stop?.(); stop = null; await queue; }
