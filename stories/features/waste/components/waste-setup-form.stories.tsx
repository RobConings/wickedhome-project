import type { Meta, StoryObj } from "@storybook/react-vite";
import { WasteSetupForm } from "@/features/waste/components/waste-setup-form";
import { wasteLookupMatchesFixture, wasteProvidersFixture, wasteSetupFixture } from "../fixtures";

/** Answers the lookup with two matches and the save with a synced setup. */
async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "waste-lookup") {
    return { ok: true, intent, providerId: formData.get("providerId"), lookup: { matches: wasteLookupMatchesFixture, problem: null } };
  }
  return { ok: true, intent, setup: wasteSetupFixture };
}

const meta = {
  title: "Features/Waste/Components/WasteSetupForm",
  component: WasteSetupForm,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: {
    providers: wasteProvidersFixture,
    suggestedProviderId: "limburg-net",
    defaults: { street: "Kempische steenweg", number: "100", postalCode: "3500", municipality: "Hasselt" },
  },
  parameters: { router: { action } },
} satisfies Meta<typeof WasteSetupForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Prefilled from the home address; press "Find address" to see the matches. */
export const Default: Story = {};
export const WithoutHomeAddress: Story = { args: { defaults: {}, suggestedProviderId: null } };
/** The collector doesn't know the street. */
export const StreetNotFound: Story = {
  parameters: {
    router: {
      action: async () => ({ ok: true, intent: "waste-lookup", providerId: "limburg-net", lookup: { matches: [], problem: "street" } }),
    },
  },
};
/** Searching takes a while: the button shows it's busy. */
export const Searching: Story = { parameters: { router: { action: () => new Promise(() => undefined) } } };
export const ChangingExisting: Story = { args: { currentProviderId: "limburg-net", onCancel: () => undefined } };
