import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StructuredResponse } from "@/features/assistant/components/structured-response";
const meta = { title: "Features/Assistant/Components/StructuredResponse", component: StructuredResponse, parameters: { layout: "fullscreen" }, decorators: [(Story) => <div className="mx-auto w-full max-w-3xl p-3"><Story /></div>], args: { onSend: fn(), response: { version: 1, components: [
  { type: "summary", title: "This month", values: [{ label: "Expenses", value: "€ 1.250,00" }] },
  { type: "chart", title: "Breakdown", points: [{ label: "Groceries", value: 45000, display: "€ 450,00" }, { label: "Energy", value: 16000, display: "€ 160,00" }] },
  { type: "shopping", title: "Shopping list", items: [{ id: "1", label: "Milk", detail: "2 packs", group: "Collect&Go", href: "/shopping" }, { id: "2", label: "Tomatoes", detail: "500 g", group: "Collect&Go", href: "/shopping" }] },
  { type: "table", title: "Compare products", columns: ["Product", "Price", "Condition", "Source"], rows: [["Milk", "€ 1,20", "From 2 packs", "Collect&Go"],["Lactose-free milk", "€ 1,80", "No offer", "Collect&Go"]] },
  { type: "choices", title: "Which one?", choices: [{ label: "Milk", message: "Choose milk" }, { label: "Lactose-free milk", message: "Choose lactose-free milk" }] },
  { type: "date_time", title: "When are we cooking?", prompt: "Cook on", includeTime: true },
] } } } satisfies Meta<typeof StructuredResponse>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Recipes: Story = { args: { response: { version: 1, components: [{ type: "recipes", title: "Tonight", items: [{ name: "Tomato pasta", detail: "4 servings · Check stock before planning", href: "/recipes" }] }, { type: "progress", title: "Checking ingredients", completed: 2, total: 4 }] } } };
