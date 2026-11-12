import type { Meta, StoryObj } from "@storybook/react-vite";
import { Masonry } from "@/components/layout/masonry";
import { Card, CardTitle, CardDescription } from "@/components/shared/card";
const meta = { title: "Layout/Masonry", component: Masonry, render: () => <Masonry>{[1, 2, 3, 4].map((n) => <Card key={n}><CardTitle>Section {n}</CardTitle><CardDescription>{"Related household records. ".repeat(n)}</CardDescription></Card>)}</Masonry> } satisfies Meta<typeof Masonry>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = {};
