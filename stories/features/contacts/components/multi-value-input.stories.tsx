import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MultiValueInput } from "@/features/contacts/components/multi-value-input";

/** Keeps the values in state, like the form does. */
function Controlled(props: Omit<React.ComponentProps<typeof MultiValueInput>, "onChange">) {
  const [values, setValues] = React.useState(props.values);
  return <MultiValueInput {...props} values={values} onChange={setValues} />;
}

const meta = {
  title: "Features/Contacts/Components/MultiValueInput",
  component: MultiValueInput,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: { id: "phones", name: "phones", values: ["+32 470 11 22 33", "011 22 33 44"], inputType: "tel", onChange: () => undefined },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof MultiValueInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Phones: Story = {};
export const Empty: Story = { args: { values: [], placeholder: "+32 470 12 34 56" } };
export const Emails: Story = { args: { id: "emails", name: "emails", inputType: "email", values: ["jan@peeters.example.be"] } };
/** The second line has an error from the schema. */
export const WithError: Story = {
  args: { errorsFor: (index: number) => (index === 1 ? ["This one is already in the list."] : undefined), values: ["0470 11 22 33", "0470/11.22.33"] },
};
export const Full: Story = { args: { values: ["1", "2", "3", "4", "5"].map((n) => `0470 00 00 0${n}`) } };
