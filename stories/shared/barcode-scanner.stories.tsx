import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { BarcodeScanner } from "@/components/shared/barcode-scanner";

const meta = {
  title: "Shared/BarcodeScanner",
  component: BarcodeScanner,
  args: { onDetect: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "Camera scanning needs a secure origin: over plain http on the LAN only the typed fallback works. Storybook on http://192.168.1.10:6006 shows the insecure message.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BarcodeScanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const QrOnly: Story = { args: { formats: ["qr_code"] } };
export const CameraOnly: Story = { args: { allowManualEntry: false } };
/** The last code is being handled (e.g. looked up): the Look up button spins. */
export const Busy: Story = { args: { busy: true } };
/**
 * Asking for the camera and loading the decoder: a spinner over the preview. Pretends to be on a secure
 * origin with a camera that never answers.
 */
export const Starting: Story = {
  beforeEach: () => {
    const secure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => new Promise<never>(() => undefined) },
    });
    return () => {
      Reflect.deleteProperty(navigator, "mediaDevices");
      if (secure) Object.defineProperty(window, "isSecureContext", secure);
      else Reflect.deleteProperty(window, "isSecureContext");
    };
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Start camera" }));
  },
};
