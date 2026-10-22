import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TradeInput } from "@/features/contacts/components/trade-input";
import { PROJECT_ROLE_SUGGESTIONS } from "@/features/contacts/types/contacts";

function Controlled(props: Omit<React.ComponentProps<typeof TradeInput>, "onChange">) {
  const [value, setValue] = React.useState(props.value);
  return <TradeInput {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Features/Contacts/Components/TradeInput",
  component: TradeInput,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
  args: { id: "trade", name: "trade", value: "", placeholder: "contractor, plumber, bank…", onChange: () => undefined },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof TradeInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Focus the field: the suggestions are in the current language. */
export const Empty: Story = {};
export const Filled: Story = { args: { value: "aannemer" } };
/** Trades the household already typed come first. */
export const WithKnownTrades: Story = { args: { extra: ["glazenwasser", "kinderopvang"] } };
export const ProjectRoles: Story = { args: { suggestions: PROJECT_ROLE_SUGGESTIONS } };
