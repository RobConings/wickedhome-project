import { useCurrentUser } from "@/features/auth";
import { NotificationsScreen } from "@/features/notifications";

/** `/notifications`: the signed-in person's notification center (docs/NOTIFICATIONS.md). Loads its own data. */
export function Component() {
  const user = useCurrentUser();
  return <NotificationsScreen userId={user.id} />;
}
