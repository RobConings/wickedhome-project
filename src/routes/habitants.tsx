import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HabitantsScreen, canManageHabitants, habitantsAction, habitantsLoader } from "@/features/household";
import { screenHandle } from "@/lib/screen-context";

export const loader = habitantsLoader;
export const action = habitantsAction;
export const handle = screenHandle(({ t }) => ({ kind: "household", label: t("nav.habitants") }));

export function Component() {
  const user = useCurrentUser();
  return (
    <HabitantsScreen overview={useLoaderData<typeof habitantsLoader>()} canManage={canManageHabitants(user.role)} />
  );
}
