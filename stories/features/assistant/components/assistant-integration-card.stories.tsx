import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantIntegrationCard } from "@/features/assistant/components/assistant-integration-card";
import { configuredStatus, configuredWithVoiceStatus, fakeAssistantClient, fakeMcpOAuthClient, never, notConfiguredStatus, ttsStatusFixture } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/AssistantIntegrationCard",
  component: AssistantIntegrationCard,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { data: configuredStatus, client: fakeAssistantClient(), oauthClient: fakeMcpOAuthClient() },
} satisfies Meta<typeof AssistantIntegrationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Configured: server, model, "Test connection" (round trip), what it can do, MCP connections (token or OAuth). */
export const Configured: Story = {};
/** Before the owner set ASSISTANT_BASE_URL / ASSISTANT_MODEL: the setup steps. */
export const NotConfigured: Story = { args: { data: notConfiguredStatus } };
export const InvalidUrl: Story = { args: { data: { ...notConfiguredStatus, problem: "invalid_url" } } };
/** The test fails: the PC is off or LM Studio isn't serving on the network. */
export const TestFails: Story = {
  args: {
    client: fakeAssistantClient({
      test: async () => ({ reachable: false, latencyMs: null, models: [], modelListed: null, error: "The model server could not be reached" }),
    }),
  },
};
export const WithServerSpeech: Story = { args: { data: { ...configuredStatus, stt: true } } };
/** Server speech both ways: Whisper for voice input and Piper reading answers aloud, with the voice choice. */
export const WithServerVoice: Story = { args: { data: configuredWithVoiceStatus } };
/** The speech server is set up but not answering: the browser's voice reads for now. */
export const ServerVoiceUnreachable: Story = {
  args: {
    data: { ...configuredWithVoiceStatus, tts: { ...ttsStatusFixture, ok: false, voices: [] } },
    client: fakeAssistantClient({ voices: async () => ({ ...ttsStatusFixture, ok: false, voices: [] }) }),
  },
};
/** A typo in ASSISTANT_TTS_URL: a warning, and the browser's voice. */
export const ServerVoiceMisconfigured: Story = {
  args: { data: { ...configuredStatus, tts: { ...ttsStatusFixture, configured: false, ok: null, host: null, voices: [], problem: "invalid_url" } } },
};
export const Loading: Story = { args: { data: never() } };
export const FailedToLoad: Story = { args: { data: null } };
