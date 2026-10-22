import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { PlacesScreen } from "@/features/places/screens/places-screen";
import { floorFixtures, placesOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Places/Screens/PlacesScreen",
  component: PlacesScreen,
  parameters: { layout: "fullscreen" },
  args: { overview: placesOverviewFixture, canManage: true },
} satisfies Meta<typeof PlacesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AsChild: Story = { args: { canManage: false } };
export const Empty: Story = { args: { overview: { floors: [], places: [] } } };

/** Creating the starter floors: the button is busy until the floors are there. */
export const CreatingStarter: Story = {
  args: { overview: { floors: [], places: [] } },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Ground floor + outside" }));
  },
};
export const NoOutsidePlan: Story = {
  args: {
    overview: {
      floors: [floorFixtures.ground],
      places: placesOverviewFixture.places.filter((place) => place.floorId === floorFixtures.ground.id),
    },
  },
};
