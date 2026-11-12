import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantMarkdown } from "@/features/assistant/components/assistant-markdown";
const meta = { title: "Features/Assistant/Components/AssistantMarkdown", component: AssistantMarkdown, parameters: { layout: "fullscreen" }, decorators: [(Story) => <div className="mx-auto max-w-3xl p-3"><Story /></div>], args: { text: '# Household overview\n\n**Ready for today.** Check [shopping](/shopping).\n\n> Your basket still needs confirmation.\n\n1. Check stock\n2. Compare products\n\n| Product | Price | Shop |\n|---|---|---|\n| Milk | € 1,20 | Collect&Go |\n\n```typescript\nconst total = items.reduce((sum, item) => sum + item.priceCents, 0);\nconsole.log(total);\n```\n\n<script>alert("unsafe")</script>\n\n[Unsafe](javascript:alert(1))' } } satisfies Meta<typeof AssistantMarkdown>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
