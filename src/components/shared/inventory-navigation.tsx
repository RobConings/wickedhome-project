import { BoxesIcon, PackageIcon, RulerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { SectionNavigation } from "@/components/shared/section-navigation";

/** Stock and product catalogue are two views of the same household inventory workspace. */
export function InventoryNavigation() {
  const { t: inventory } = useTranslation("inventory");
  const { t: shopping } = useTranslation("shopping");
  const { t: units } = useTranslation("units");
  const { pathname } = useLocation();
  return <SectionNavigation
    label={inventory("page.title")}
    items={[
      { id: "stock", label: inventory("page.title"), to: "/inventory", icon: BoxesIcon, current: pathname === "/inventory" },
      { id: "products", label: shopping("products.title"), to: "/shopping/products", icon: PackageIcon, current: pathname === "/shopping/products" },
      { id: "units", label: units("title"), to: "/settings?section=units", icon: RulerIcon, current: false },
    ]}
  />;
}
