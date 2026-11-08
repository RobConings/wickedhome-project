import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { fetchVoucherDetail, VoucherDetailScreen } from "@/features/income";
import { ApiRequestError } from "@/lib/api-client";
import { screenHandle } from "@/lib/screen-context";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const search = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["receiptPage", "spendingPage"]) if (search.has(key)) query.set(key, search.get(key)!);
  try { return await fetchVoucherDetail(params.personId!, `?${query}`); }
  catch (error) { if (error instanceof ApiRequestError && error.status === 404) throw new Response(null, { status: 404 }); throw error; }
}
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "vouchers", id: data.person.id, label: data.person.name }));
export function Component() { return <VoucherDetailScreen detail={useLoaderData<typeof loader>()} />; }
