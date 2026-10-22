import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MailLinkDialog } from "@/features/integrations/components/mail-link-dialog";
import {
  connectedGoogleFixture,
  fakeGoogleClient,
  fluviusMatchFixture,
  linkOptionsFixture,
  linkRecurringFixture,
  luminusMatchFixture,
  mailSuggestionsFixture,
  occurrencesFixture,
  paidTargetFixture,
} from "../fixtures";

const fluviusMail = mailSuggestionsFixture[0]!;
const luminusMail = mailSuggestionsFixture[3]!;
const watergroepMail = { ...mailSuggestionsFixture[2]!, dueDate: "2027-10-28", matches: [] };

const meta = {
  title: "Features/Integrations/Components/MailLinkDialog",
  component: MailLinkDialog,
  args: {
    suggestion: fluviusMail,
    open: true,
    onOpenChange: fn(),
    onLinked: fn(),
    client: fakeGoogleClient(connectedGoogleFixture),
    initialOptions: linkOptionsFixture,
  },
} satisfies Meta<typeof MailLinkDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Choosing: ranked matches (with why they match), all expenses to search (paid ones too), or a recurring expense. */
export const ChooseTarget: Story = {};
/**
 * Review with the before → after diff: amount, due date and structured communication are ticked because they
 * differ and the expense is unpaid; IBAN is offered but not ticked. Link attaches the PDF.
 */
export const ReviewWithDiff: Story = { args: { initialTarget: fluviusMatchFixture } };
/** A paid expense: nothing is ticked, and ticking the amount or due date shows it changes what was paid. */
export const PaidExpense: Story = { args: { initialTarget: paidTargetFixture } };
/**
 * Recurring expense: the payment nearest to the mail's due date is picked; it lies beyond the generated
 * horizon, so it doesn't exist yet and is created when linking.
 */
export const RecurringOccurrenceChoice: Story = {
  args: { suggestion: watergroepMail, initialRecurring: linkRecurringFixture[2], initialOccurrences: occurrencesFixture },
};
/**
 * A remembered sender: the review of this month's Luminus payment, "Always link mails from Luminus to Luminus
 * energie" already on, and "Update the recurring expense too" offering the mail's structured communication.
 */
export const RememberedRule: Story = { args: { suggestion: luminusMail, initialTarget: luminusMatchFixture } };
/** Loading the expenses (skeleton rows). */
export const Loading: Story = { args: { initialOptions: undefined, client: fakeGoogleClient(connectedGoogleFixture, { hang: true }) } };
/** The expenses couldn't be loaded: retry. */
export const LoadError: Story = { args: { initialOptions: undefined, client: fakeGoogleClient(connectedGoogleFixture, { fail: true }) } };
export const Mobile: Story = { args: { initialTarget: fluviusMatchFixture }, globals: { viewport: { value: "mobile1" } } };
