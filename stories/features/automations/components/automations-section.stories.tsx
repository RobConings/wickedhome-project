import type { Meta, StoryObj } from "@storybook/react-vite";
import { AutomationsSection } from "@/features/automations";
import {
  automationsFixture,
  emptyAutomationsFixture,
  failedAutomationsFixture,
  fakeAutomationsClient,
  pausedAutomationsFixture,
  runningAutomationsFixture,
} from "../fixtures";

const meta = {
  title: "Features/Automations/Components/AutomationsSection",
  component: AutomationsSection,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { data: automationsFixture, client: fakeAutomationsClient(automationsFixture) },
} satisfies Meta<typeof AutomationsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four daily jobs, all fine. Try the switches and "Run now" (a pretend run takes 3 s). */
export const Default: Story = {};

/** The waste sync is running: its button stays busy while the section polls it. */
export const Running: Story = {
  args: { data: runningAutomationsFixture, client: fakeAutomationsClient(runningAutomationsFixture, { runMs: Infinity }) },
};

/** The last waste sync failed: the error shows on the row and in the open history. "Run now" fails again. */
export const Failed: Story = {
  args: {
    data: failedAutomationsFixture,
    client: fakeAutomationsClient(failedAutomationsFixture, { failWith: "Limburg.net didn't answer within 30 s (HTTP 504)" }),
  },
};

/** The shop icon retry is paused. */
export const Paused: Story = {
  args: { data: pausedAutomationsFixture, client: fakeAutomationsClient(pausedAutomationsFixture) },
};

/** Children see everything but can't pause or run. */
export const ReadOnly: Story = {
  args: { data: { ...automationsFixture, canManage: false } },
};

export const Empty: Story = {
  args: { data: emptyAutomationsFixture, client: fakeAutomationsClient(emptyAutomationsFixture) },
};

/** Without loader data the section loads itself: a skeleton until the jobs arrive. */
export const Loading: Story = {
  args: { data: undefined, client: fakeAutomationsClient(automationsFixture, { listDelayMs: Infinity }) },
};

/** Deferred loader data (how Settings passes it): a skeleton until the promise resolves, here after 1.5 s. */
export const Deferred: Story = {
  args: { data: new Promise((resolve) => setTimeout(() => resolve(automationsFixture), 1_500)) },
};

/** The loader couldn't fetch the jobs. */
export const LoadError: Story = { args: { data: null } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
