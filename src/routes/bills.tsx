import { billsRedirectLoader } from "@/features/expenses";

/** `/bills` and `/bills/:billId` moved to the expenses (`/expenses`, `/expenses/:id`). */
export const loader = billsRedirectLoader;

export function Component() {
  return null;
}
