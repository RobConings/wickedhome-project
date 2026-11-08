import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { ApplianceDetailScreen } from "@/features/energy/screens/appliance-detail-screen";
import { useSelections } from "@/lib/selections";
import { applianceFixtures, energyPlaceFixtures } from "../fixtures";
function SelectionFixtures({ children }: { children: ReactNode }) { useSelections("place", { initial: {} }); return children; }
const appliance = { ...Object.values(applianceFixtures)[0]!, id: "fridge", name: "Family fridge", parentApplianceId: "kitchen", device: { id: "device-fridge", name: "Fridge sensor" } };
const meta = { title: "Features/Energy/Screens/ApplianceDetailScreen", component: ApplianceDetailScreen, parameters: { layout: "fullscreen", router: { initialEntries: ["/energy/appliances/fridge?from=%2Fenergy%3Fperiod%3Dmonth%26date%3D2026-10-01"] } }, decorators: [(Story) => <SelectionFixtures><Story /></SelectionFixtures>], args: { appliance, appliances: [appliance, { ...appliance, id: "kitchen", name: "Kitchen circuit", parentApplianceId: null }], places: energyPlaceFixtures, meters: [], canManage: true } } satisfies Meta<typeof ApplianceDetailScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Independent: Story = { args: { appliance: { ...appliance, parentApplianceId: null, device: null } } };
