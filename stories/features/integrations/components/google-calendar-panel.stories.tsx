import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GoogleCalendarPanel } from "@/features/integrations/components/google-calendar-panel";
import { connectedGoogleFixture, fakeGoogleClient, googleCalendarsFixture } from "../fixtures";

const settings = connectedGoogleFixture.calendar!;

const meta = {
  title: "Features/Integrations/Components/GoogleCalendarPanel",
  component: GoogleCalendarPanel,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { settings, client: fakeGoogleClient(connectedGoogleFixture), onStatus: fn(), onConnect: fn(), canPublish: true },
} satisfies Meta<typeof GoogleCalendarPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Calendar selection: switch calendars on/off (optimistic), choose who sees them; publishing to "Gezin". */
export const CalendarSelection: Story = {};

/** Publishing not allowed yet: one button asks Google for write access. */
export const PublishNotAllowed: Story = {
  args: { canPublish: false, settings: { ...settings, publish: { calendarId: null, categories: [], publishedCount: 0, lastPublishedAt: null, lastError: null } } },
};

/** A calendar failed to sync, and publishing failed. */
export const WithErrors: Story = {
  args: {
    settings: {
      calendars: googleCalendarsFixture.map((calendar) => (calendar.id === "cal2" ? { ...calendar, lastError: "www.googleapis.com/calendar/v3/… answered 403 (forbidden)" } : calendar)),
      publish: { ...settings.publish, lastError: "Writing to Google Calendar isn't allowed (yet)" },
    },
  },
};

/** No calendars yet (first sync pending). */
export const Empty: Story = { args: { settings: { ...settings, calendars: [] } } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
