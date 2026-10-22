import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlarmCard } from "@/features/home-assistant/components/alarm-card";
import { AlarmCardSkeleton } from "@/features/home-assistant/components/alarm-card-skeleton";
import { HA_NOW, alarmOverview, notConfiguredStatus, unreachableStatus } from "../fixtures";

const meta = {
  title: "Features/HomeAssistant/Components/AlarmCard",
  component: AlarmCard,
  args: { overview: alarmOverview(), canControl: true, live: false, now: HA_NOW, className: "w-[26rem] max-w-full" },
} satisfies Meta<typeof AlarmCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Disarmed: Arm (home) and Arm (away), each behind a confirmation; the last changes below. */
export const Disarmed: Story = {};
/** Armed (away): Arm (home) and Disarm (with the code). */
export const ArmedAway: Story = { args: { overview: alarmOverview({ state: "armed_away" }) } };
export const ArmedHome: Story = { args: { overview: alarmOverview({ state: "armed_home" }) } };
/** Triggered: red, pulsing; only Disarm. */
export const Triggered: Story = { args: { overview: alarmOverview({ state: "triggered" }) } };
export const Pending: Story = { args: { overview: alarmOverview({ state: "pending" }) } };
/** The panel wants the code to arm too (`code_arm_required`). */
export const CodeToArm: Story = { args: { overview: alarmOverview({ codeArmRequired: true }) } };
/** Dashboard and House page: state and actions, no history. */
export const Compact: Story = { args: { compact: true, overview: alarmOverview({ state: "armed_home" }) } };
/** Children see the state, no buttons. */
export const AsChild: Story = { args: { canControl: false, overview: alarmOverview({ state: "armed_away" }) } };
/** Home Assistant unreachable: the card stays, without actions. */
export const Unavailable: Story = { args: { overview: { ...alarmOverview(), status: unreachableStatus, panel: null, history: [] } } };
/** Not configured: the card renders nothing (shown here as an empty canvas). */
export const NotConfigured: Story = { args: { overview: { ...alarmOverview(), status: notConfiguredStatus, panel: null } } };
/** The Suspense fallback on the Home Assistant page. */
export const Loading: Story = { render: (args) => <AlarmCardSkeleton className={args.className} /> };
