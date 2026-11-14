import { z } from "zod";
import { haControlInputSchema, type HaControl } from "@/types/home-controls";

const id = z.string().min(1).max(100);
export const homeActionStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("device"), deviceId: id, ...haControlInputSchema.shape, onFailure: z.enum(["stop", "continue"]).default("stop") }).strict(),
  z.object({ kind: z.literal("wait"), seconds: z.number().int().min(1).max(300) }).strict(),
]);
export const homeActionInputSchema = z.object({
  name: z.string().trim().min(1).max(70),
  icon: z.enum(["house", "log-out", "moon", "tv", "sparkles"]).default("sparkles"),
  favourite: z.boolean().default(true),
  contactDeviceIds: z.array(id).max(100).default([]),
  alarmMode: z.enum(["home", "away"]).nullable().default(null),
  steps: z.array(homeActionStepSchema).min(1).max(20),
}).strict();
export type HomeActionInput = z.infer<typeof homeActionInputSchema>;
export type HomeActionStep = z.infer<typeof homeActionStepSchema>;
export type HomeAction = HomeActionInput & { id: string; revision: number; publishedRevision: number | null; updatedAt: string };
export const homeActionSaveSchema = z.object({ definition: homeActionInputSchema, revision: z.number().int().min(1).optional() }).strict();
export const homeActionRunSchema = z.object({ confirm: z.literal(true), requestKey: z.string().uuid(), code: z.string().min(1).max(32).optional(), revision: z.number().int().min(1) }).strict();
export const homeRuleTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("time"), at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).strict(),
  z.object({ kind: z.literal("sunset"), offsetMinutes: z.number().int().min(-120).max(120).default(0) }).strict(),
  z.object({ kind: z.literal("state"), deviceId: id, entityId: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/), to: z.string().min(1).max(50), forSeconds: z.number().int().min(0).max(86400).default(0) }).strict(),
]);
export const homeRuleInputSchema = z.object({
  name: z.string().trim().min(1).max(70), actionId: id,
  trigger: homeRuleTriggerSchema,
  weekdays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1).max(7).default(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  cooldownSeconds: z.number().int().min(0).max(86400).default(60),
  enabled: z.boolean().default(false),
}).strict();
export type HomeRuleInput = z.infer<typeof homeRuleInputSchema>;
export type HomeRule = HomeRuleInput & { id: string; revision: number; publishedRevision: number | null };
export type ActionStepResult = { index: number; status: "requested" | "confirmed" | "skipped" | "failed"; at: string };
export type HomeActionRun = { id: string; actionId: string; name: string; revision: number; actorName: string; source: string; status: string; steps: ActionStepResult[]; startedAt: string; finishedAt: string | null; detail: string | null };
export type HomeControlDevice = { id: string; name: string; room: string | null; notes: string | null; controls: HaControl[]; contactEntityIds: string[]; observations?: { entityId: string; state: string }[] };
export type HomeActionsOverview = { actions: HomeAction[]; rules: HomeRule[]; runs: HomeActionRun[]; devices: HomeControlDevice[]; connected: boolean; publishingReady: boolean };
export type HomeActionPreview = { ready: boolean; issues: string[]; steps: { index: number; label: string; entityId: string | null; alreadySatisfied: boolean }[]; alarmMode: "home" | "away" | null };
