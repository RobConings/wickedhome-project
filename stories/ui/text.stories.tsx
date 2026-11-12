import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";

const meta = { title: "UI/Text", component: Text, args: { children: "Your household, together." } } satisfies Meta<typeof Text>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Muted: Story = { args: { size: "sm", tone: "muted" } };
export const Error: Story = { args: { size: "sm", tone: "danger", role: "alert" } };
export const NumericValue: Story = { args: { size: "3xl", weight: "semibold", className: "tabular-nums", children: "€ 125,00" } };
export const InheritedContext: Story = { render: () => <Stack className="text-xs text-muted-foreground"><Text>Inherits size and colour.</Text><Text size="base" tone="primary">An explicit style overrides the context.</Text></Stack> };
