import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="open" className="w-96">
      <TabsList>
        <TabsTrigger value="open">Open</TabsTrigger>
        <TabsTrigger value="late">Late</TabsTrigger>
        <TabsTrigger value="done">Done</TabsTrigger>
      </TabsList>
      <TabsContent value="open">Items that still need doing.</TabsContent>
      <TabsContent value="late">Items past their date.</TabsContent>
      <TabsContent value="done">Finished items.</TabsContent>
    </Tabs>
  ),
};

export const WithCounts: Story = {
  render: () => (
    <Tabs defaultValue="open">
      <TabsList>
        <TabsTrigger value="open">
          Open <Badge variant="secondary">12</Badge>
        </TabsTrigger>
        <TabsTrigger value="late">
          Late <Badge variant="destructive">2</Badge>
        </TabsTrigger>
        <TabsTrigger value="done">Done</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
};
