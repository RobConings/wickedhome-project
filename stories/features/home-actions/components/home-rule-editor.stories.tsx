import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeRuleEditor } from "@/features/home-actions/components/home-rule-editor";
import { overviewFixture } from "../fixtures";
const meta = { title: "Features/HomeActions/Components/HomeRuleEditor", component: HomeRuleEditor, args: { initial: overviewFixture.rules[0], actions: overviewFixture.actions, devices: overviewFixture.devices, canPublish: true, onSaved: () => {}, onClose: () => {} } } satisfies Meta<typeof HomeRuleEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Time: Story = {};
export const Contact: Story = { args: { initial: { ...overviewFixture.rules[0]!, trigger: { kind: "state", deviceId: "contact", entityId: "binary_sensor.window", to: "on", forSeconds: 900 } } } };
