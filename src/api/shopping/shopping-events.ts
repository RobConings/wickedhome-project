import { publish } from "../lib/events";

export const publishShoppingChanged = (householdId: string) =>
  publish(householdId, "shopping.changed", { scope: "requirements" });

/** Publish only after the service succeeds, regardless of whether web, MCP or a job called it. */
export function withShoppingEvents<Args extends unknown[], Result>(
  work: (...args: Args) => Promise<Result>,
) {
  return async (...args: Args): Promise<Result> => {
    const result = await work(...args);
    if (result !== false && result !== 0) {
      const actor = args[0] as string | { householdId: string };
      publishShoppingChanged(
        typeof actor === "string" ? actor : actor.householdId,
      );
    }
    return result;
  };
}
