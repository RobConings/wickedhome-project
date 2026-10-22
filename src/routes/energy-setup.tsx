import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { EnergySetupScreen, canManageEnergy, energySetupAction, energySetupLoader } from "@/features/energy";
import { todayIn } from "@/types/dates";

export const loader = energySetupLoader;
export const action = energySetupAction;

export function Component() {
  const user = useCurrentUser();
  return (
    <EnergySetupScreen
      setup={useLoaderData<typeof energySetupLoader>()}
      today={todayIn()}
      canManage={canManageEnergy(user.role)}
    />
  );
}
