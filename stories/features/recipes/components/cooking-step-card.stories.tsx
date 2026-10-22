import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { CookingStepCard } from "@/features/recipes/components/cooking-step-card";
import { recipeFixture } from "../fixtures";

function Stepper(props: Partial<React.ComponentProps<typeof CookingStepCard>>) {
  const [current, setCurrent] = React.useState(props.current ?? 0);
  return <CookingStepCard steps={recipeFixture.steps} {...props} current={current} onChange={setCurrent} />;
}

const meta = {
  title: "Features/Recipes/Components/CookingStepCard",
  component: Stepper,
  args: { current: 1 },
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A step with a timer; Previous / Next (swipe on a phone). */
export const Default: Story = {};
/** The last step: "Done cooking" instead of Next. */
export const LastStep: Story = {
  args: {
    current: 4,
    finish: (
      <Button size="lg" className="h-12">
        Done cooking
      </Button>
    ),
  },
};
export const NoSteps: Story = { args: { steps: [] } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
