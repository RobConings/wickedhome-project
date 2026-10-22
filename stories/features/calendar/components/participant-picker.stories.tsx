import type { Meta, StoryObj } from "@storybook/react-vite";
import { ParticipantPicker } from "@/features/calendar/components/participant-picker";
import { calendarHabitants } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/ParticipantPicker",
  component: ParticipantPicker,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: { name: "participantIds", label: "Who", habitants: calendarHabitants },
} satisfies Meta<typeof ParticipantPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithSelection: Story = { args: { defaultValue: ["h3", "h1"] } };
