import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HomeAssistantScreen, canManageHomeAssistant, homeAssistantAction, homeAssistantLoader } from "@/features/home-assistant";

export const loader = homeAssistantLoader;
export const action = homeAssistantAction;

export function Component() {
  const user = useCurrentUser();
  const data = useLoaderData<typeof homeAssistantLoader>();
  return <HomeAssistantScreen {...data} canManage={canManageHomeAssistant(user.role)} />;
}
