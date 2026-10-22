import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceBadge } from "@/features/places/components/place-badge";
import { placeFixtures } from "../fixtures";

const meta = {
  title: "Features/Places/Components/PlaceBadge",
  component: PlaceBadge,
  args: { place: placeFixtures.kitchen },
} satisfies Meta<typeof PlaceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Room: Story = {};
export const Zone: Story = { args: { place: placeFixtures.jacuzzi } };
export const WithoutIcon: Story = { args: { place: placeFixtures.hall } };
export const WithFloor: Story = { args: { place: placeFixtures.office, floorName: placeFixtures.office.floorName } };
export const Overview: Story = {
  render: () => (
    <div className="flex max-w-md flex-wrap gap-2">
      {Object.values(placeFixtures).map((place) => (
        <PlaceBadge key={place.id} place={place} />
      ))}
    </div>
  ),
};
