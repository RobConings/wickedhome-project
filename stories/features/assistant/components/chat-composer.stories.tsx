import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChatComposer } from "@/features/assistant/components/chat-composer";
import { VoiceButton } from "@/features/assistant/components/voice-button";

const meta = {
  title: "Features/Assistant/Components/ChatComposer",
  component: ChatComposer,
  decorators: [(Story) => <div className="w-[36rem] max-w-full">{Story()}</div>],
  args: {
    busy: false,
    onSend: fn(),
    onStop: fn(),
    voice: <VoiceButton state="idle" supported onStart={fn()} onStop={fn()} />,
  },
} satisfies Meta<typeof ChatComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Answering: Send became Stop. */
export const Answering: Story = { args: { busy: true } };
/** Push-to-talk held: the interim transcript shows above the field. */
export const Listening: Story = {
  args: { hint: "What's on tod…", voice: <VoiceButton state="listening" supported onStart={fn()} onStop={fn()} /> },
};
export const Transcribing: Story = {
  args: { hint: "Turning speech into text…", voice: <VoiceButton state="transcribing" supported onStart={fn()} onStop={fn()} /> },
};
export const MicrophoneBlocked: Story = { args: { hint: "The microphone is blocked. Allow it in the browser's site settings." } };
export const NoVoice: Story = { args: { voice: <VoiceButton state="idle" supported={false} onStart={fn()} onStop={fn()} /> } };
/** Opened from a page (screen context): the chip says what the question is about; one tap leaves it out. */
export const WithScreen: Story = { args: { screen: { label: "Spaghetti bolognese", on: true, onToggle: fn() } } };
/** The chip tapped off: this question goes without the page. */
export const WithScreenOff: Story = { args: { screen: { label: "Spaghetti bolognese", on: false, onToggle: fn() } } };
/** A phone with a long label: the chip truncates instead of pushing the buttons out. */
export const WithScreenMobile: Story = {
  args: { screen: { label: "Tomaten in blik van de Colruyt, de grote doos uit de kelder", on: true, onToggle: fn() } },
  globals: { viewport: { value: "mobile1" } },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
