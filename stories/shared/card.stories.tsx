import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shared/card";

const meta = {
  title: "Shared/Card",
  component: Card,
  decorators: [(Story) => <div className="w-80"><Story /></div>],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Card title</CardTitle>
          <CardDescription>Supporting text for the card.</CardDescription>
        </div>
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
