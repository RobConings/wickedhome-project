import { useLoaderData, useSearchParams } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { SCAN_MODES, ScanScreen, canManageStock, inventoryAction, scanLoader, type ScanMode } from "@/features/inventory";
import { screenHandle } from "./lib/screen-context";

export const loader = scanLoader;
export const action = inventoryAction;
export const handle = screenHandle(({ t }) => ({ kind: "scan", label: t("screen.scan") }));

export function Component() {
  const user = useCurrentUser();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const initialMode = (SCAN_MODES as readonly string[]).includes(mode ?? "") ? (mode as ScanMode) : undefined;
  return <ScanScreen data={useLoaderData<typeof scanLoader>()} canManage={canManageStock(user.role)} initialMode={initialMode} />;
}
