import {
  DumbbellIcon,
  GlobeIcon,
  HammerIcon,
  PawPrintIcon,
  PillIcon,
  ShirtIcon,
  ShoppingBasketIcon,
  SofaIcon,
  SparklesIcon,
  SproutIcon,
  StoreIcon,
  TagIcon,
  TvIcon,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { ShopType } from "../types/shops";

const SHOP_TYPE_ICONS: Record<ShopType, LucideIcon> = {
  supermarket: ShoppingBasketIcon,
  discount: TagIcon,
  diy: HammerIcon,
  garden: SproutIcon,
  home: SofaIcon,
  electronics: TvIcon,
  pharmacy: PillIcon,
  drugstore: SparklesIcon,
  pets: PawPrintIcon,
  sports: DumbbellIcon,
  fashion: ShirtIcon,
  online: GlobeIcon,
  other: StoreIcon,
};

/** The icon for a kind of shop. Decorative: pair it with the type label or the shop name. */
export function ShopTypeIcon({ type, ...props }: LucideProps & { type: ShopType }) {
  const Icon = SHOP_TYPE_ICONS[type];
  return <Icon aria-hidden="true" {...props} />;
}
