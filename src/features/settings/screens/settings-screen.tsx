import * as React from "react";
import { CloudSunIcon, HouseIcon, LayoutGridIcon, SettingsIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelatedRecordCards } from "@/components/shared/related-record-cards";
import { SectionNavigation } from "@/components/shared/section-navigation";
import { HouseholdSettingsForm } from "@/features/household";
import { WasteSettingsSection } from "@/features/waste";
import { WeatherSettingsSection } from "@/features/weather";
import type { SectionAccent } from "@/lib/section-accent";
import type { SettingsData } from "../data/settings-loaders";

/** One block of the settings page, contributed by a feature. */
export type SettingsSectionItem = {
  /** Anchor: `/settings#<id>`. */
  id: string;
  icon: LucideIcon;
  accent?: SectionAccent;
  title: string;
  description?: string;
  content: React.ReactNode;
};

type SettingsScreenProps = {
  data: SettingsData;
  /** Owners and adults change settings; children see them read-only. */
  canManage: boolean;
  /**
   * More sections from the route, shown after the built-in ones: "Automations" (scheduled jobs) goes
   * here first, then integrations, notifications… later.
   */
  extraSections?: SettingsSectionItem[];
};

/** Owner-provided settings stay in their feature; navigation mounts one section at a time. */
export function SettingsScreen({ data, canManage, extraSections = [] }: SettingsScreenProps) {
  const { t } = useTranslation("settings");
  const location = useLocation();
  const unavailable = <ErrorState title={t("sectionError.title")} description={t("sectionError.description")} />;
  const address = data.household?.address;

  const sections: SettingsSectionItem[] = [
    {
      id: "household",
      icon: HouseIcon,
      title: t("sections.household.title"),
      description: t("sections.household.description"),
      content: data.household ? <HouseholdSettingsForm settings={data.household} canManage={canManage} /> : unavailable,
    },
    {
      id: "waste",
      icon: Trash2Icon,
      title: t("sections.waste.title"),
      description: t("sections.waste.description"),
      content: data.waste ? (
        <WasteSettingsSection
          settings={data.waste}
          canManage={canManage}
          today={data.today}
          habitants={data.habitants}
          defaults={
            address
              ? {
                  street: address.street,
                  number: address.number,
                  box: address.box ?? undefined,
                  postalCode: address.postalCode,
                  municipality: address.municipality,
                }
              : {}
          }
        />
      ) : (
        unavailable
      ),
    },
    {
      id: "weather",
      icon: CloudSunIcon,
      title: t("sections.weather.title"),
      description: t("sections.weather.description"),
      content: data.weather ? <WeatherSettingsSection settings={data.weather} canManage={canManage} /> : unavailable,
    },
    // Spot for sections owned by other features (Automations next), passed in by the route.
    ...extraSections,
  ];

  // Keep bookmarked notification, weather and MCP links such as `/settings#waste` working.
  const params = new URLSearchParams(location.search);
  const selectedId = params.get("section") ?? location.hash.slice(1);
  const selected = sections.find((section) => section.id === selectedId);
  const sectionLink = (id?: string) => {
    const next = new URLSearchParams(location.search);
    if (id) next.set("section", id);
    else next.delete("section");
    return { pathname: "/settings", search: next.size ? `?${next}` : "", hash: "" };
  };

  return (
    <PageContainer className="max-w-4xl" data-accent={selected?.accent ?? "home"}>
      <PageHeader
        title={selected?.title ?? t("title")}
        description={selected?.description ?? t("description")}
        icon={selected?.icon ?? SettingsIcon}
        breadcrumbs={selected ? [{ label: t("title"), to: `/settings${sectionLink().search}` }, { label: selected.title }] : undefined}
      />
      {selected ? (
        <>
          <SectionNavigation label={t("jumpTo")} items={[
            { id: "all", label: t("allSections"), to: sectionLink(), icon: LayoutGridIcon, current: false },
            ...sections.map((section) => ({ id: section.id, label: section.title, to: sectionLink(section.id), icon: section.icon, current: section.id === selected.id })),
          ]} />
          <PageSection key={selected.id} id={selected.id} aria-label={selected.title}>
            {selected.content}
          </PageSection>
        </>
      ) : (
        <RelatedRecordCards label={t("jumpTo")} descriptionMaxLength={90} className="auto-rows-fr" items={sections.map((section) => ({
          id: section.id, label: section.title, description: section.description,
          to: sectionLink(section.id), icon: section.icon, accent: section.accent ?? "home",
        }))} />
      )}
    </PageContainer>
  );
}
