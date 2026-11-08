import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeviceTasksPanel } from "@/features/tasks/components/project-tasks-panel";
import { emptyTasksOverviewFixture, childViewer, taskFixtures, taskHabitants, taskPlaces } from "../fixtures";
const device = { id: "device-boiler", name: "Boiler" };
const meta = {
  title: "Features/Tasks/Components/DeviceTasksPanel",
  component: DeviceTasksPanel,
  parameters: { layout: "padded" },
  args: {
    deviceId: device.id,
    placeSelections: { favoriteIds: [], recentIds: [] },
    initialData: { overview: { ...emptyTasksOverviewFixture, tasks: [{ ...taskFixtures.gutters, title: "Service the boiler", device, place: null }] }, habitants: taskHabitants, places: taskPlaces },
  },
} satisfies Meta<typeof DeviceTasksPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { initialData: { overview: emptyTasksOverviewFixture, habitants: taskHabitants, places: taskPlaces } } };
export const Child: Story = { args: { initialData: { ...meta.args.initialData, overview: { ...meta.args.initialData.overview, viewer: childViewer } } } };
