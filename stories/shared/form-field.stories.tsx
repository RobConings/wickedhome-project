import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";

const meta = {
  title: "Shared/FormField",
  component: FormField,
  decorators: [(Story) => <div className="w-80"><Story /></div>],
  args: {
    label: "Email",
    htmlFor: "story-email",
    children: <Input id="story-email" type="email" />,
  },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithDescription: Story = { args: { description: "We never share it." } };
export const Optional: Story = { args: { optionalLabel: "optional" } };
export const WithError: Story = {
  args: {
    errors: ["Enter a valid email address."],
    children: <Input id="story-email" type="email" defaultValue="rob@" />,
  },
};
