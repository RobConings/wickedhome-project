import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useCurrentUser } from "@/features/auth";
import {
  shoppingLoader,
  SessionsScreen,
  fetchShoppingSession,
  fetchShoppingSessions,
} from "@/features/shopping";
export async function loader({ params }: LoaderFunctionArgs) {
  const [shopping, sessions, session] = await Promise.all([
    shoppingLoader(),
    fetchShoppingSessions(),
    params.sessionId ? fetchShoppingSession(params.sessionId) : null,
  ]);
  return { shopping, sessions, session };
}
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <SessionsScreen {...data} canManage={user.role !== "child"} />;
}
