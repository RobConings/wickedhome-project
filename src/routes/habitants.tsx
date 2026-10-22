import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HabitantsScreen, canManageHabitants, habitantsAction, habitantsLoader } from "@/features/household";

export const loader = habitantsLoader;
export const action = habitantsAction;

export function Component() {
  const user = useCurrentUser();
  return (
    <HabitantsScreen overview={useLoaderData<typeof habitantsLoader>()} canManage={canManageHabitants(user.role)} />
  );
}
