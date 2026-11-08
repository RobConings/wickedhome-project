import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyMeterScreen } from "@/features/energy/screens/energy-meter-screen";
import { appliancesFixture, dataOverviewFixture } from "../fixtures";
const meter = { ...dataOverviewFixture.meters[4]!, name: "Manual solar channel" };
const detail = { meter, appliance: null, solar: { id: "solar1", name: "South roof" }, battery: null, readings: { items: dataOverviewFixture.readings.filter((row) => row.meterId === meter.id), total: 2, page: 1, pageSize: 25 } };
const meta = {
  title: "Features/Energy/Screens/EnergyMeterScreen", component: EnergyMeterScreen,
  parameters: { layout: "fullscreen" },
  args: { detail, appliances: appliancesFixture, now: { date: "2026-10-02", time: "09:00" }, canManage: true },
} satisfies Meta<typeof EnergyMeterScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Empty: Story = { args: { detail: { ...detail, readings: { items: [], total: 0, page: 1, pageSize: 25 } } } };
export const Imported: Story = { args: { detail: { ...detail, meter: { ...dataOverviewFixture.meters[0]!, name: "Imported grid channel" } } } };
