import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { ProductCategoryIcon } from "@/features/shopping/components/product-category-icon";
import { PRODUCT_CATEGORIES } from "@/features/shopping/types/shopping";

const meta = {
  title: "Features/Shopping/Components/ProductCategoryIcon",
  component: ProductCategoryIcon,
  args: { category: "dairy" },
} satisfies Meta<typeof ProductCategoryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

function AllCategories() {
  const { t } = useTranslation("shopping");
  return (
    <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      {PRODUCT_CATEGORIES.map((category) => (
        <li key={category} className="flex items-center gap-2">
          <ProductCategoryIcon category={category} className="size-5 text-primary" />
          {t(`categories.${category}`)}
        </li>
      ))}
    </ul>
  );
}

export const All: Story = { render: () => <AllCategories /> };
