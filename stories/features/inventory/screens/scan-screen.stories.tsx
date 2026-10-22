import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ScanScreen } from "@/features/inventory/screens/scan-screen";
import { failedBarcodeLookup, fakeBarcodeLookup, shopSelectionsFixture, stalledBarcodeLookup, suggestionFixtures } from "../../shopping/fixtures";
import { fakeScan, scanPageFixture, scanResultFixtures } from "../fixtures";

const meta = {
  title: "Features/Inventory/Screens/ScanScreen",
  component: ScanScreen,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Type 8076802085738 (spaghetti), 5410013108009 (coffee, two places), 5449000000996 (unknown cola: filled in), 8700216011167 (unknown dish soap: filled in, no photo) or any other number in the code field.",
      },
    },
  },
  args: { data: scanPageFixture, canManage: true, lookup: fakeScan, productLookup: fakeBarcodeLookup, initialSelections: { shops: shopSelectionsFixture } },
} satisfies Meta<typeof ScanScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UseOne: Story = {};
export const AddStock: Story = { args: { initialMode: "add" } };
export const WhatIsThis: Story = { args: { initialMode: "identify", initialResult: scanResultFixtures.twoPlaces } };
/** Alternatives: a scanned brand shows its own name; the stock is the one it shares. */
export const ScannedAlternative: Story = { args: { initialMode: "identify", initialResult: scanResultFixtures.alternative } };
/** A known product that isn't kept yet: keep it somewhere, or link it as another brand of something kept. */
export const NotKeptYet: Story = {
  args: { initialMode: "identify", initialResult: { code: "5400141020458", productId: "pr-milk", scannedProductId: "pr-milk", stockItems: [] } },
};
export const UnknownBarcode: Story = { args: { initialResult: scanResultFixtures.unknown } };
export const UnknownAsChild: Story = { args: { initialResult: scanResultFixtures.unknown, canManage: false } };

/** A typed (or scanned) code is being looked up: the result card and the Look up button show it. */
export const LookingUp: Story = {
  args: { lookup: () => new Promise<never>(() => undefined) },
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox", { name: "Code" }), "8076802085738{Enter}");
  },
};

// Barcode auto-fill: an unknown barcode is looked up and, when known, offered as a filled-in new product.

/** Not one of ours: finding out what it is (the scanner waits). */
export const LookingUpUnknownBarcode: Story = {
  args: { productLookup: stalledBarcodeLookup },
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox", { name: "Code" }), "5449000000996{Enter}");
  },
};

/** Known, with a photo: big card and one big button (the filled-in form opens by itself after a live scan). */
export const FoundWithPhoto: Story = {
  args: { initialResult: scanResultFixtures.unknown, initialAutofill: { code: "5449000000996", status: "found", suggestion: suggestionFixtures.cola } },
};

export const FoundWithoutPhoto: Story = {
  args: {
    initialResult: { code: "8700216011167", productId: null, scannedProductId: null, stockItems: [] },
    initialAutofill: { code: "8700216011167", status: "found", suggestion: suggestionFixtures.dishSoap },
  },
};

export const FoundAsChild: Story = { args: { ...FoundWithPhoto.args, canManage: false } };

/** Nobody knows the code: the normal empty form, with a neutral message. */
export const NotFound: Story = {
  args: { initialResult: { code: "5400141020458", productId: null, scannedProductId: null, stockItems: [] }, initialAutofill: { code: "5400141020458", status: "not_found", suggestion: null } },
};

/** Offline or the lookup failed: looks just like "not found", no error. */
export const LookupFailed: Story = {
  args: { initialResult: scanResultFixtures.unknown, initialAutofill: { code: "5449000000996", status: "unavailable", suggestion: null }, productLookup: failedBarcodeLookup },
};

/** A scan of a known barcode: after the lookup the filled-in product form opens. */
export const FormPrefilled: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox", { name: "Code" }), "5449000000996{Enter}");
  },
};
