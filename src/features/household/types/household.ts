import { z } from "zod";
import { hexColorSchema, isoDateSchema } from "@/types/common";

export const HABITANT_TYPES = ["adult", "child", "pet", "guest"] as const;
export const habitantTypeSchema = z.enum(HABITANT_TYPES);
export type HabitantType = z.infer<typeof habitantTypeSchema>;

export const habitantInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: habitantTypeSchema,
  color: hexColorSchema,
  emoji: z.string().trim().max(8).optional().nullable(),
  birthday: isoDateSchema.optional().nullable(),
});
export type HabitantInput = z.infer<typeof habitantInputSchema>;

export type Habitant = {
  id: string;
  name: string;
  type: HabitantType;
  color: string;
  emoji: string | null;
  /** `YYYY-MM-DD` */
  birthday: string | null;
  /** Whether this habitant can log in (is linked to a user account). */
  hasAccount: boolean;
};

export type Household = {
  id: string;
  name: string;
};

export type HouseholdOverview = {
  household: Household;
  habitants: Habitant[];
};

/** Palette offered when picking a habitant colour. Tuned to work on light and dark backgrounds. */
export const HABITANT_COLORS = [
  "#124734",
  "#6b8f73",
  "#3b82b6",
  "#7c5cc4",
  "#c2508a",
  "#d4573b",
  "#d9912b",
  "#7d9a3c",
  "#6b7280",
] as const;

/** Adults and owners manage habitants; children can only look. Mirrors the API's role check. */
export const canManageHabitants = (role: "owner" | "adult" | "child") => role !== "child";
