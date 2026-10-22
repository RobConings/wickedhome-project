import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HaEntityBrowser } from "@/features/home-assistant/components/ha-entity-browser";
import { entitiesFixture } from "../fixtures";

const meta = {
  title: "Features/HomeAssistant/Components/HaEntityBrowser",
  component: HaEntityBrowser,
  args: { entities: entitiesFixture, storageKey: "story-ha-entities" },
} satisfies Meta<typeof HaEntityBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Read-only, as on the Home Assistant page: search by name, entity id, area or domain. */
export const Default: Story = {};
/** Binding a boolean field: only on/off and open/closed entities, rows are buttons. */
export const PickForBoolean: Story = {
  args: { fieldType: "boolean", onPick: fn(), selectedId: "binary_sensor.kitchen_window", boundIds: new Set(["binary_sensor.kitchen_window"]) },
};
/** Binding a number field (temperature, power). */
export const PickForNumber: Story = { args: { fieldType: "number", onPick: fn() } };
export const Loading: Story = { args: { entities: [], loading: true } };
export const Empty: Story = { args: { entities: [] } };
export const LoadError: Story = { args: { entities: [], error: true, onRetry: fn() } };
