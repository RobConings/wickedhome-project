import * as React from "react";
import { CloudSunIcon, HouseIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { PageContainer } from "../components/page-container";
import { PageSection } from "../components/page-section";
import { ScrollRow } from "../components/scroll-row";
import { ErrorState } from "../components/error-state";
import { PageHeader } from "../components/page-header";
import { SectionHeader } from "../components/section-header";
import { HouseholdSettingsForm } from "@/features/household";
import { WasteSettingsSection } from "@/features/waste";
import { WeatherSettingsSection } from "@/features/weather";
import { cn } from "@/lib/utils";
import type { SettingsData } from "../data/settings-loaders";

/** One block of the settings page, contributed by a feature. */
export type SettingsSectionItem = {
  /** Anchor: `/settings#<id>`. */
  id: string;
  icon: LucideIcon;
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

/** Scrolls to `#section` after navigating to `/settings#section` (links from the dashboard cards). */
function useScrollToHash() {
  const { hash } = useLocation();
  React.useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);
}

/**
 * Settings: one page, a section per feature (household and address, waste collector, later integrations
 * and notifications), with a jump list on top. A section that failed to load shows an error by itself.
 */
export function SettingsScreen({ data, canManage, extraSections = [] }: SettingsScreenProps) {
  const { t } = useTranslation("settings");
  useScrollToHash();
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

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={t("title")} description={t("description")} />

      {/* Jump links: one row that scrolls inside itself on phones, wrapping from `md`. */}
      <nav aria-label={t("jumpTo")} className="-mt-4">
        <ScrollRow wrapFrom="md" focusable={false}>
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm transition-colors outline-none",
              "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
          >
            <section.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {section.title}
          </a>
        ))}
        </ScrollRow>
      </nav>

      {sections.map((section) => (
        <PageSection key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-20">
          <SectionHeader id={`${section.id}-heading`} title={section.title} description={section.description} />
          {section.content}
        </PageSection>
      ))}
    </PageContainer>
  );
}
