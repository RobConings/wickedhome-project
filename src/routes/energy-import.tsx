import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { EnergyImportScreen, canManageEnergy, energyImportAction, energyImportLoader } from "@/features/energy";
import { formatTime } from "@/types/date-format";
import { todayIn } from "@/types/dates";

export const loader = energyImportLoader;
export const action = energyImportAction;

/** "14:05" on the household's wall clock. */
const currentTime = () => formatTime(new Date());

export function Component() {
  const user = useCurrentUser();
  const { data, appliances, settings } = useLoaderData<typeof energyImportLoader>();
  return (
    <EnergyImportScreen
      data={data}
      appliances={appliances}
      settings={settings}
      now={{ date: todayIn(), time: currentTime() }}
      canManage={canManageEnergy(user.role)}
    />
  );
}
