import type { Meta, StoryObj } from "@storybook/react-vite";
import { MailBillSuggestions } from "@/features/integrations/components/mail-bill-suggestions";
import {
  connectedGoogleFixture,
  expenseHabitants,
  expenseShops,
  expensesToday,
  fakeGoogleClient,
  linkOptionsFixture,
  mailSuggestionsFixture,
  payeeFixtures,
} from "../fixtures";

const meta = {
  title: "Features/Integrations/Components/MailBillSuggestions",
  component: MailBillSuggestions,
  decorators: [(Story) => <div className="w-[48rem] max-w-full">{Story()}</div>],
  args: {
    habitants: expenseHabitants,
    shops: expenseShops,
    payees: payeeFixtures,
    today: expensesToday,
    initial: mailSuggestionsFixture,
    client: fakeGoogleClient(connectedGoogleFixture),
    linkOptions: linkOptionsFixture,
  },
} satisfies Meta<typeof MailBillSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Suggestions list, each with its best match: "Looks like: Fluvius · 20 Oct 2026 · € 109,00" makes *Link* the
 * main action (opens the review with the diff); a weak one says "Maybe: …". Accept opens the expense form
 * prefilled (amount, due date, structured communication, IBAN); Dismiss hides it.
 */
export const SuggestionsList: Story = {};
/** A suggestion with a strong best match: *Link* is the main button, *Add as new* the second. */
export const WithBestMatch: Story = { args: { initial: [mailSuggestionsFixture[0]!] } };
/** The sender is remembered ("Always link mails from Luminus to Luminus energie"): pre-matched to this month's payment, still a tap to link. */
export const RememberedSender: Story = { args: { initial: [mailSuggestionsFixture[3]!] } };
/** One suggestion without an amount (the mail and PDF didn't say). */
export const Single: Story = { args: { initial: [mailSuggestionsFixture[1]!] } };
/** Loading its own data: a one-row skeleton. */
export const Loading: Story = { args: { initial: undefined, client: fakeGoogleClient(connectedGoogleFixture, { hang: true }) } };
/** Nothing to suggest: renders nothing. */
export const Empty: Story = { args: { initial: [] } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
