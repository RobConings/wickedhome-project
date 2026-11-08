import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeRoomMap, HomeRoomMapSkeleton } from "@/features/dashboard/components/home-room-map";
import { homeMapFixture } from "../home-map-fixture";
import { DEVICES_NOW } from "../../devices/fixtures";

const meta = { title: "Features/Dashboard/Components/HomeRoomMap", component: HomeRoomMap, parameters: { layout: "padded" }, args: { data: homeMapFixture, live: false, now: DEVICES_NOW } } satisfies Meta<typeof HomeRoomMap>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Failed: Story = { args: { data: null } };
export const UnknownWork: Story = { args: { data: { ...homeMapFixture, tasks: null, projects: null } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

export const Loading: Story = { render: () => <HomeRoomMapSkeleton /> };
