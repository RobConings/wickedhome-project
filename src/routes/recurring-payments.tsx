import { useLoaderData } from "react-router";
import { RecurringPaymentsScreen, recurringPaymentsLoader } from "@/features/expenses";
import { screenHandle } from "@/lib/screen-context";
export const loader = recurringPaymentsLoader;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "recurring_expense", id: data.payments.recurring.id, label: data.payments.recurring.payee }));
export function Component() { return <RecurringPaymentsScreen {...useLoaderData<typeof loader>()} />; }
