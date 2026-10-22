import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PlacePicker } from "@/features/places/components/place-picker";
import { placeFixtures, placeSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Places/Components/PlacePicker",
  component: PlacePicker,
  args: {
    places: Object.values(placeFixtures),
    name: "placeId",
    onChange: fn(),
    initialSelections: placeSelectionsFixture,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlacePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFavoritesAndRecents: Story = {};
export const Selected: Story = { args: { defaultValue: "p-jacuzzi", clearable: true } };
export const NoHistory: Story = { args: { initialSelections: { favoriteIds: [], recentIds: [] } } };
/** The places are still loading (e.g. fetched by the picker's parent): placeholder rows, spinner in the trigger. */
export const Loading: Story = { args: { places: [], loading: true, defaultValue: "p-jacuzzi" } };
