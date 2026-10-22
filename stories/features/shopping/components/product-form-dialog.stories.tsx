import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ProductFormDialog } from "@/features/shopping/components/product-form-dialog";
import {
  failedBarcodeLookup,
  fakeBarcodeLookup,
  fakeLinkPreview,
  productFixtures,
  shopListFixture,
  shopSelectionsFixture,
  stalledBarcodeLookup,
  suggestionFixtures,
} from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductFormDialog",
  component: ProductFormDialog,
  args: {
    shops: shopListFixture,
    trigger: <Button>Add product</Button>,
    initialSelections: shopSelectionsFixture,
    lookup: fakeBarcodeLookup,
    previewLink: fakeLinkPreview,
  },
} satisfies Meta<typeof ProductFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new product, with the webshop link field under "Usually bought at". */
export const Default: Story = {};
export const Create: Story = {};
export const Edit: Story = { args: { product: productFixtures.coffee, trigger: <Button variant="outline">Edit coffee</Button> } };
export const EssentialProduct: Story = {
  args: { product: productFixtures.milk, trigger: <Button variant="outline">Edit milk</Button> },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
};
export const FromScannedBarcode: Story = {
  args: { defaults: { barcode: "5449000000996" }, lookup: fakeBarcodeLookup, trigger: <Button>Create product</Button> },
};

/** Saving: the fields are locked, Save spins and the dialog stays open until the save is done. */
export const Saving: Story = {
  args: { product: productFixtures.coffee, trigger: <Button variant="outline">Edit coffee</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};

/** Opened from a scan whose barcode was known: name, category and photo are filled in. */
export const PrefilledFromScan: Story = {
  args: { defaults: { barcode: "5449000000996" }, suggestion: suggestionFixtures.cola, lookup: fakeBarcodeLookup, trigger: <Button>Add this product</Button> },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
};

/** Typing a known barcode offers to fill in the rest (try 5449000000996 or 8700216011167). */
export const TypedBarcodeFound: Story = {
  args: { lookup: fakeBarcodeLookup },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.type(await screen.findByRole("textbox", { name: /Barcode/ }), "5449000000996");
  },
};

/** The typed barcode is being looked up. */
export const TypedBarcodeLookingUp: Story = {
  args: { lookup: stalledBarcodeLookup },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.type(await screen.findByRole("textbox", { name: /Barcode/ }), "5449000000996");
  },
};

/** Nobody knows the code: a quiet hint, the form stays as it is. */
export const TypedBarcodeNotFound: Story = {
  args: { lookup: fakeBarcodeLookup },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.type(await screen.findByRole("textbox", { name: /Barcode/ }), "5400141020458");
  },
};

/** Offline or the lookup failed: the same quiet hint, no error. */
export const TypedBarcodeOffline: Story = {
  args: { lookup: failedBarcodeLookup },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.type(await screen.findByRole("textbox", { name: /Barcode/ }), "5449000000996");
  },
};

const openDialog = async ({ canvasElement }: { canvasElement: HTMLElement }, name: string) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name }));
};

/** Editing a product with webshop links: the default shop's link fills "Webshop link"; the other shop is in the hint. */
export const WithLink: Story = {
  args: { product: productFixtures.coffee, trigger: <Button variant="outline">Edit coffee</Button> },
  play: (context) => openDialog(context, "Edit coffee"),
};
/** Pasting a known webshop's link: the page is read and the empty name and price can be filled in; the shop is matched by domain. */
export const PastingPreview: Story = {
  play: async (context) => {
    await openDialog(context, "Add product");
    await userEvent.type(await screen.findByLabelText(/Webshop link/), "https://www.gamma.be/nl/assortiment/tacker/p/B123456");
  },
};
/** Clearing the link asks first: saving removes that shop's link. */
export const RemovingLink: Story = {
  args: { product: productFixtures.coffee, trigger: <Button variant="outline">Edit coffee</Button> },
  play: async (context) => {
    await openDialog(context, "Edit coffee");
    await userEvent.clear(await screen.findByLabelText(/Webshop link/));
  },
};
export const Mobile: Story = {
  args: { product: productFixtures.coffee, trigger: <Button variant="outline">Edit coffee</Button> },
  globals: { viewport: { value: "mobile1" } },
  play: (context) => openDialog(context, "Edit coffee"),
};
