import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { VoiceButton } from "@/features/assistant/components/voice-button";

const meta = {
  title: "Features/Assistant/Components/VoiceButton",
  component: VoiceButton,
  args: { state: "idle", supported: true, onStart: fn(), onStop: fn() },
} satisfies Meta<typeof VoiceButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hold to talk, release to send (or tap to toggle). */
export const Idle: Story = {};
export const Listening: Story = { args: { state: "listening" } };
/** Server speech-to-text (local Whisper) is working on the recording. */
export const Transcribing: Story = { args: { state: "transcribing" } };
/** No recognition in this browser, or plain http (no microphone). */
export const Unsupported: Story = { args: { supported: false } };
export const Disabled: Story = { args: { disabled: true } };
