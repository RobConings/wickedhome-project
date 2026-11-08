import { ChartNoAxesCombinedIcon, PlugZapIcon, SettingsIcon, UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { SectionNavigation } from "@/components/shared/section-navigation";

const PAGES = [
  { to: "/energy", key: "overview", icon: ChartNoAxesCombinedIcon },
  { to: "/energy/appliances", key: "appliances", icon: PlugZapIcon },
  { to: "/energy/setup", key: "setup", icon: SettingsIcon },
  { to: "/energy/import", key: "import", icon: UploadIcon },
] as const;

export function EnergyNav({ className }: { className?: string }) {
  const { t } = useTranslation("energy");
  const { pathname } = useLocation();
  return <SectionNavigation label={t("nav.label")} className={className} items={PAGES.map((page) => ({
    id: page.key, to: page.to, icon: page.icon, label: t(`nav.${page.key}`),
    current: page.key === "overview" ? pathname === page.to : pathname === page.to || pathname.startsWith(`${page.to}/`),
  }))} />;
}
