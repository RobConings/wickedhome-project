import { z } from "zod";

// The assistant's floor-plan preview (`kind: "plan-diff"` on a confirmation card): the floor before and after a
// drawing change, so the person sees what "Apply" will do. Built on the server (ai/skills/floorplan), drawn by
// `PlanDiffPreview` in the browser. Points are `[x, y]` in plan centimetres (x right, y down, like the plan).
// Kept small: only what the drawing needs, no ids.

export const PLAN_DIFF_KIND = "plan-diff";

export const PLAN_DIFF_STATES = ["same", "added", "changed", "removed"] as const;
export type PlanDiffState = (typeof PLAN_DIFF_STATES)[number];

const coordinate = z.number().finite().min(-200_000).max(200_000);
const pointSchema = z.tuple([coordinate, coordinate]);
const stateSchema = z.enum(PLAN_DIFF_STATES);

export const planDiffDataSchema = z.object({
  /** Floor name, for the accessible label. */
  floor: z.string().max(80),
  /** Where north points on the plan (degrees clockwise from up), or null. */
  north: z.number().finite().min(0).lt(360).nullable(),
  rooms: z
    .array(
      z.object({
        name: z.string().max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        state: stateSchema,
        /** The outline after the change (for `removed`: the outline that goes away). */
        points: z.array(pointSchema).min(3).max(200),
        /** `changed`: the outline before the change. */
        before: z.array(pointSchema).min(3).max(200).optional(),
      }),
    )
    .max(300),
  walls: z.array(z.object({ a: pointSchema, b: pointSchema, thickness: z.number().finite().min(1).max(200), state: stateSchema })).max(2000),
  /** Doors and windows as the gap they leave in their wall; doors also with their leaf (hinge → tip). */
  openings: z
    .array(
      z.object({
        kind: z.enum(["door", "window"]),
        a: pointSchema,
        b: pointSchema,
        hinge: pointSchema.optional(),
        tip: pointSchema.optional(),
        state: stateSchema,
      }),
    )
    .max(2000),
  /** Device and appliance markers that move (or appear) with this change. */
  markers: z.array(z.object({ name: z.string().max(80), at: pointSchema, state: stateSchema })).max(50).optional(),
});
export type PlanDiffData = z.infer<typeof planDiffDataSchema>;
export type PlanDiffPoint = z.infer<typeof pointSchema>;
