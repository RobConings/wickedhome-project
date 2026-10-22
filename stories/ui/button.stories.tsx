import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

const meta = {
  title: "UI/Button",
  component: Button,
  args: { children: "Save" },
  argTypes: {
    variant: { control: "select", options: ["default", "secondary", "outline", "ghost", "destructive", "link"] },
    size: { control: "select", options: ["xs", "sm", "default", "lg", "icon", "icon-sm"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button>
        <PlusIcon />
        Add
      </Button>
      <Button variant="outline" size="icon" aria-label="Delete">
        <Trash2Icon />
      </Button>
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true } };

/**
 * `fullOnMobile`: on phones the button takes the full width and its label wraps instead of running out of
 * it (text buttons in cards and sections). From `sm` up it is a normal button.
 */
export const FullOnMobile: Story = {
  render: () => (
    <div className="flex w-full max-w-xs flex-col items-start gap-3 rounded-lg border border-dashed p-3">
      <Button variant="outline" size="sm" fullOnMobile>
        <PlusIcon />
        Toestellen toevoegen aan het huis
      </Button>
      <Button fullOnMobile>Naar de huisweergave</Button>
    </div>
  ),
};

export const FullOnMobilePhone: Story = { ...FullOnMobile, globals: { viewport: { value: "mobile1" } } };

export const Loading: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button loading>Saving…</Button>
      <Button variant="outline" loading>
        <PlusIcon />
        Add
      </Button>
      <Button variant="outline" size="icon" aria-label="Delete" loading>
        <Trash2Icon />
      </Button>
    </div>
  ),
};
