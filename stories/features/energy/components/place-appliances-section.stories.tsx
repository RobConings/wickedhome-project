import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceAppliancesSection } from "@/features/energy/components/place-appliances-section";
import { applianceFixtures, appliancesFixture } from "../fixtures";

const kitchenId = applianceFixtures.hob.placeId ?? "";
const jacuzziId = applianceFixtures.jacuzzi.placeId ?? "";

const meta = {
  title: "Features/Energy/Components/PlaceAppliancesSection",
  component: PlaceAppliancesSection,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: { placeId: kitchenId, initialData: appliancesFixture },
} satisfies Meta<typeof PlaceAppliancesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four kitchen appliances, none of them measured. */
export const Kitchen: Story = {};
/** A measured appliance shows the "Measured" badge. */
export const Jacuzzi: Story = { args: { placeId: jacuzziId } };
export const NoAppliances: Story = { args: { placeId: "p-unknown" } };
/** Without data and without an API (Storybook), it shows the retry state after loading. */
export const LoadingOrError: Story = { args: { initialData: undefined } };
/** Loading: skeleton rows while the appliances load (the request never answers here). */
export const Loading: Story = {
  args: { initialData: undefined },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => new Promise<Response>(() => {});
    return () => {
      globalThis.fetch = original;
    };
  },
};
