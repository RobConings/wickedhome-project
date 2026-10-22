import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { EnergyOverviewScreen, canManageEnergy, energyOverviewLoader } from "@/features/energy";
import { screenHandle } from "./lib/screen-context";

export const loader = energyOverviewLoader;
export const handle = screenHandle(({ t }) => ({ kind: "energy", label: t("nav.energy") }));

export function Component() {
  const user = useCurrentUser();
  const { overview, carrier, period, date, today } = useLoaderData<typeof energyOverviewLoader>();
  return (
    <EnergyOverviewScreen
      overview={overview}
      carrier={carrier}
      period={period}
      date={date}
      today={today}
      canManage={canManageEnergy(user.role)}
    />
  );
}
