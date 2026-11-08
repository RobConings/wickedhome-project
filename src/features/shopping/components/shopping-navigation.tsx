import { ListChecksIcon, ShoppingCartIcon, StoreIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { SectionNavigation } from "@/components/shared/section-navigation";

/** The shopping list, shop view and actual visits are distinct views of one shopping workspace. */
export function ShoppingNavigation() {
  const { t } = useTranslation("shopping");
  const { pathname } = useLocation();
  const pages = [
    { id: "list", to: "/shopping", label: t("page.title"), icon: ListChecksIcon },
    { id: "shops", to: "/shopping/shops", label: t("actions.shopView"), icon: StoreIcon },
    { id: "sessions", to: "/shopping/sessions", label: t("sessions.title"), icon: ShoppingCartIcon },
  ];
  return <SectionNavigation label={t("navigation.label")} items={pages.map((page) => ({ ...page, current: page.id === "list" ? pathname === page.to : pathname === page.to || pathname.startsWith(`${page.to}/`) }))} />;
}
