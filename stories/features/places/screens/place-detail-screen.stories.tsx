import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceDetailScreen } from "@/features/places/screens/place-detail-screen";
import { placeDetailFixture, placeDetailNotDrawnFixture } from "../fixtures";

const meta = {
  title: "Features/Places/Screens/PlaceDetailScreen",
  component: PlaceDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { detail: placeDetailFixture, canManage: true },
} satisfies Meta<typeof PlaceDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Drawn: Story = {};
export const NotDrawn: Story = { args: { detail: placeDetailNotDrawnFixture } };
export const AsChild: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
