import { ActivityIcon, CpuIcon, HouseIcon, MapIcon, PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { SectionNavigation } from "@/components/shared/section-navigation";
import { HOME_VIEWS, homeView } from "../types/home-view";
export function HomeControlNavigation() {
  const { t } = useTranslation("home-actions");
  const [params] = useSearchParams();
  const current = homeView(params), icons = [HouseIcon, MapIcon, CpuIcon, PlayIcon, ActivityIcon];
  return <SectionNavigation label={t("navigation")} items={HOME_VIEWS.map((view, index) => {
    const next = new URLSearchParams(params); next.set("section", view); next.delete("device"); next.delete("room");
    return { id: view, label: t(`views.${view}`), icon: icons[index]!, current: view === current, to: `/house?${next}` };
  })} />;
}
