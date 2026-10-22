/**
 * Household roles and the one permission rule most features share. Feature contracts export their own
 * `canManage<Feature>` names (so a feature can tighten its rule later) as aliases of `canManageHousehold`.
 */
export type HouseholdRole = "owner" | "adult" | "child";

/** Owners and adults may change things; children only look (and do what a feature explicitly allows). */
export const canManageHousehold = (role: HouseholdRole): boolean => role !== "child";
