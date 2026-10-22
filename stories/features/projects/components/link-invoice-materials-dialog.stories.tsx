import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { LinkInvoiceMaterialsDialog } from "@/features/projects/components/link-invoice-materials-dialog";
import { invoiceExpenseFixture, invoiceMaterialsFixture, invoiceReadingFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/LinkInvoiceMaterialsDialog",
  component: LinkInvoiceMaterialsDialog,
  args: {
    projectId: "pr-spa",
    expense: invoiceExpenseFixture,
    materials: invoiceMaterialsFixture,
    invoiceReader: true,
    trigger: <Button>Link materials</Button>,
    readInvoice: () => new Promise(() => undefined),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await screen.findByRole("dialog");
  },
} satisfies Meta<typeof LinkInvoiceMaterialsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Manual linking: tick the materials, check the prices against the expense. */
export const Default: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
/** "Read invoice with AI" running (it never answers here). */
export const Loading: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /read invoice/i }));
  },
};
/** The AI's proposal: matches ticked with invoice prices, one to check, a line that isn't a material yet. */
export const AiProposed: Story = { args: { initialReading: invoiceReadingFixture } };
export const AiProposedMobile: Story = { args: { initialReading: invoiceReadingFixture }, globals: { viewport: { value: "mobile1" } } };
/** The reading failed: the message, and manual linking still works. */
export const ReadFailed: Story = {
  args: { readInvoice: () => Promise.reject(new Error("no")) },
  play: Loading.play,
};
/** The assistant isn't set up: no AI button. */
export const WithoutAssistant: Story = { args: { invoiceReader: false } };
