import type { Product } from "../types/shopping";
import { ProductCategoryIcon } from "./product-category-icon";

const BOX = {
  md: { image: "size-10 shrink-0 rounded-lg border bg-white object-contain", icon: "grid size-10 shrink-0 place-items-center rounded-full bg-section-soft text-section" },
  lg: { image: "size-11 shrink-0 rounded-lg border bg-white object-contain", icon: "grid size-11 shrink-0 place-items-center rounded-full bg-section-soft text-section" },
} as const;

type ProductThumbProps = {
  product: Pick<Product, "imageUrl" | "category">;
  /** `md` (2.5 rem, list rows) or `lg` (2.75 rem, cards and headers). */
  size?: keyof typeof BOX;
  /** The category icon's size when there is no photo. */
  iconClassName?: string;
};

/** A product's photo, or its category icon in a round chip when it has none. */
export function ProductThumb({ product, size = "md", iconClassName = "size-5" }: ProductThumbProps) {
  return product.imageUrl ? (
    <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" className={BOX[size].image} />
  ) : (
    <span className={BOX[size].icon}>
      <ProductCategoryIcon category={product.category} className={iconClassName} />
    </span>
  );
}
