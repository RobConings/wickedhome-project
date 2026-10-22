import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceShoppingSection } from "@/features/shopping/components/place-shopping-section";
import { failApi, itemFixtures, stallApi } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/PlaceShoppingSection",
  component: PlaceShoppingSection,
  args: { placeId: "p-jacuzzi", initialItems: [itemFixtures.nailGun, itemFixtures.sheeting] },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlaceShoppingSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Jacuzzi: Story = {};
export const Empty: Story = { args: { initialItems: [] } };

/** First load: placeholder rows shaped like the list. */
export const Loading: Story = { args: { initialItems: undefined }, beforeEach: stallApi };
/** The first load failed: an error with "Try again" instead of an endless skeleton. */
export const LoadFailed: Story = { args: { initialItems: undefined }, beforeEach: failApi };
