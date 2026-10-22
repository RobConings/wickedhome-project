import { useFetcher } from "react-router";

/** Fetcher key of an appliance's delete, shared by its actions and its row or tile. */
export const applianceDeleteKey = (id: string) => `appliance-delete-${id}`;

/** True while this appliance is being deleted (from its actions, wherever they are), so it can fade. */
export function useApplianceDeleting(id: string): boolean {
  return useFetcher({ key: applianceDeleteKey(id) }).state !== "idle";
}
