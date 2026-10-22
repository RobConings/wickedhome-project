import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FavoriteToggle } from "@/components/shared/favorite-toggle";

const meta = {
  title: "Shared/FavoriteToggle",
  component: FavoriteToggle,
  args: { active: false, label: "Add to favourites" },
} satisfies Meta<typeof FavoriteToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { active: true, label: "Remove from favourites" } };
export const Small: Story = { args: { active: true, size: "sm", label: "Remove from favourites" } };

export const Interactive: Story = {
  render: function Render(args) {
    const [active, setActive] = React.useState(false);
    return <FavoriteToggle {...args} active={active} onClick={() => setActive(!active)} />;
  },
};

/** `onToggle` returns a slow promise: the star flips at once and is confirmed when it settles. */
export const Optimistic: Story = {
  render: function Render(args) {
    const [active, setActive] = React.useState(false);
    return (
      <FavoriteToggle
        {...args}
        active={active}
        onToggle={(next) => new Promise<void>((resolve) => setTimeout(() => (setActive(next), resolve()), 1500))}
      />
    );
  },
};

/** The request fails: the star flips back when the promise rejects. */
export const OptimisticFailure: Story = {
  render: (args) => (
    <FavoriteToggle {...args} onToggle={() => new Promise((_, reject) => setTimeout(reject, 1500))} />
  ),
};
