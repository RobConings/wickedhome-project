import type { Meta, StoryObj } from "@storybook/react-vite";
import { MailOriginNote } from "@/features/integrations/components/mail-origin-note";

const meta = {
  title: "Features/Integrations/Components/MailOriginNote",
  component: MailOriginNote,
  decorators: [(Story) => <p className="text-xs text-muted-foreground">212 kB · 2 Oct 2026 · {Story()}</p>],
  args: { origin: { documentFileId: "doc1", receivedAt: "2026-10-02T08:00:00Z", payee: "Luminus" } },
} satisfies Meta<typeof MailOriginNote>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Next to an expense's attachment that came from a mail bill (accepted or linked): "From mail on 2 Oct 2026". */
export const Default: Story = {};
