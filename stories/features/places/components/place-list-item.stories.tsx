import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceListItem } from "@/features/places/components/place-list-item";
import { placeFixtures } from "../fixtures";

const meta = {
  title: "Features/Places/Components/PlaceListItem",
  component: PlaceListItem,
  args: { place: placeFixtures.kitchen },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlaceListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Drawn: Story = {};
export const NotDrawn: Story = { args: { place: placeFixtures.laundry } };
export const WithoutIcon: Story = { args: { place: placeFixtures.hall } };
