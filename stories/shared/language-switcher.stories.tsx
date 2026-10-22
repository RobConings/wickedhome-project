import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

const meta = {
  title: "Shared/LanguageSwitcher",
  component: LanguageSwitcher,
  args: { value: "en", onChange: fn() },
} satisfies Meta<typeof LanguageSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = {};
export const Dutch: Story = { args: { value: "nl" } };
