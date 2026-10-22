import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { ApplianceCategoryIcon } from "@/features/energy/components/appliance-category-icon";
import { APPLIANCE_CATEGORIES } from "@/features/energy/types/energy";

const meta = {
  title: "Features/Energy/Components/ApplianceCategoryIcon",
  component: ApplianceCategoryIcon,
  args: { category: "jacuzzi_pool" },
} satisfies Meta<typeof ApplianceCategoryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

function AllCategories() {
  const { t } = useTranslation("energy");
  return (
    <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      {APPLIANCE_CATEGORIES.map((category) => (
        <li key={category} className="flex items-center gap-2">
          <ApplianceCategoryIcon category={category} className="size-5 text-muted-foreground" />
          {t(`categories.${category}`)}
        </li>
      ))}
    </ul>
  );
}

export const All: Story = { render: () => <AllCategories /> };
