import { subscriptionsRedirectLoader } from "@/features/expenses";

/**
 * `/subscriptions` and `/subscriptions/:subscriptionId` moved to the expenses: the Recurring view, or the
 * recurring expense a subscription was migrated to.
 */
export const loader = subscriptionsRedirectLoader;

export function Component() {
  return null;
}
