import type { Meta, StoryObj } from "@storybook/react-vite";
import { VoicePicker } from "@/features/assistant/components/voice-picker";
import { fakeAssistantClient, never, ttsStatusFixture } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/VoicePicker",
  component: VoicePicker,
  decorators: [(Story) => <div className="w-[36rem] max-w-full rounded-lg border p-3">{Story()}</div>],
  args: { client: fakeAssistantClient() },
} satisfies Meta<typeof VoicePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A voice per language for this device; "Test" plays a sample (a chime here) after a short load. */
export const Default: Story = {};
export const Loading: Story = { args: { client: fakeAssistantClient({ voices: never }) } };
export const FailedToLoad: Story = {
  args: {
    client: fakeAssistantClient({
      voices: async () => {
        throw new Error("offline");
      },
    }),
  },
};
/** The speech server doesn't answer: a warning, the pickers stay (the standard voices). */
export const Unreachable: Story = { args: { client: fakeAssistantClient({ voices: async () => ({ ...ttsStatusFixture, ok: false, voices: [] }) }) } };
/** Only Dutch voices installed. */
export const NoEnglishVoices: Story = {
  args: { client: fakeAssistantClient({ voices: async () => ({ ...ttsStatusFixture, voices: ttsStatusFixture.voices.filter((voice) => voice.locale === "nl") }) }) },
};
/** The sample can't be made: the Test button shows why. */
export const TestFails: Story = {
  args: {
    client: fakeAssistantClient({
      speech: async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        throw new Error("502");
      },
    }),
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
