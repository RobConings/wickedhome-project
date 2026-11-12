import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardHeading, CardTitle } from "@/components/shared/card";

const meta = {
  title: "Shared/Card",
  component: Card,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="w-full max-w-sm"><Story /></div>],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardHeading title="Card title" description="Supporting text for the card." />
      </CardHeader>
      <CardContent>
        <p className="text-sm">Any content goes here.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
        <Button size="sm" variant="ghost">
          Secondary
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const HeadingWithAction: Story = { render: () => <Card><CardHeader><CardHeading title="A longer card title" description="The description stays below its title on narrow screens." /><Button size="icon" aria-label="Add">+</Button></CardHeader></Card> };

/** `attention` (peach edge: "needs you"), `section`, `featured` and status edges. */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["attention", "section", "featured", "danger", "warning", "success"] as const).map((tone) => (
        <Card key={tone} tone={tone} className="p-4">
          <CardTitle>{tone}</CardTitle>
          <CardDescription>Card with tone="{tone}".</CardDescription>
        </Card>
      ))}
    </div>
  ),
};
