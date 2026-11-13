import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { SettingsScreen } from "@/features/settings/screens/settings-screen";
import { householdOverviewFixture } from "../../household/fixtures";
import { emptyHouseholdSettingsFixture, householdSettingsFixture } from "../../household/settings-fixtures";
import { WASTE_TODAY, unconfiguredWasteSettingsFixture, wasteSettingsFixture } from "../../waste/fixtures";
import { weatherSettingsFixture } from "../../weather/fixtures";
import { BellIcon, HistoryIcon, PlugIcon, RulerIcon, ShoppingCartIcon, StoreIcon, UserCogIcon, UsersIcon, WorkflowIcon } from "lucide-react";
import { UnitCatalogueSection } from "@/features/units";
import { CollectAndGoSettings, XtraSettings } from "@/features/shopping";

const extraSections = [
  { id: "units", title: "Eenheden", icon: RulerIcon, description: "Bekijk alle eenheden en hun koppelingen. Beheer omzettingen voor producten en recepten.", content: <UnitCatalogueSection canManage initialData={{ units: [{ name: "fles 75 cl", referenceUnit: "cl", factor: 75, rounding: 1, aliases: ["wijnfles"] }, { name: "krat wijn", referenceUnit: "fles 75 cl", factor: 6, rounding: 1, aliases: [] }, { name: "ton", referenceUnit: "kg", factor: 1000, rounding: 0.001, aliases: [] }], updatedAt: null }} /> },
  { id: "account", title: "Mijn account", icon: UserCogIcon, description: "Je e-mailadres, wachtwoord, taal en toestellen.", content: null },
  { id: "notifications", title: "Meldingen", icon: BellIcon, description: "Op je telefoon en in de app: op welke toestellen, wat en wanneer.", content: null },
  { id: "accounts", title: "Accounts", icon: UsersIcon, description: "Wie kan inloggen, en uitnodigingen voor de anderen.", content: null },
  { id: "activity", title: "Activiteit", icon: HistoryIcon, description: "Wie wat veranderde: in de app, via de assistent, een MCP-client of een automatisering.", content: null },
  { id: "automations", title: "Automatisaties", icon: WorkflowIcon, description: "Werk dat WickedHome zelf op een vast moment doet, zoals de afvalkalender ophalen. Pauzeer er een of voer hem nu uit.", content: null },
  { id: "integrations", title: "Koppelingen", icon: PlugIcon, description: "Google, Home Assistant, de assistent", content: null },
];

const meta = {
  title: "Features/Settings/Screens/SettingsScreen",
  component: SettingsScreen,
  parameters: { layout: "fullscreen" },
  args: { data: { today: WASTE_TODAY, household: householdSettingsFixture, waste: wasteSettingsFixture, weather: weatherSettingsFixture, habitants: householdOverviewFixture.habitants }, canManage: true },
} satisfies Meta<typeof SettingsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** A new household: no address, no collector. */
export const FirstVisit: Story = {
  args: { data: { today: WASTE_TODAY, household: emptyHouseholdSettingsFixture, waste: unconfiguredWasteSettingsFixture, weather: { ...weatherSettingsFixture, providerId: "open-meteo", last: null }, habitants: [] } },
};
export const ReadOnly: Story = { args: { canManage: false } };
/** The waste section failed to load; the household section still works. */
export const SectionFailed: Story = { parameters: { router: { initialEntries: ["/settings#waste"] } }, args: { data: { today: WASTE_TODAY, household: householdSettingsFixture, waste: null, weather: weatherSettingsFixture, habitants: [] } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };

export const Household: Story = { parameters: { router: { initialEntries: ["/settings?section=household"] } } };
export const Shopping: Story = { parameters: { router: { initialEntries: ["/settings?section=shopping"] } } };
export const LegacyWasteLink: Story = { parameters: { router: { initialEntries: ["/settings#waste"] } } };
export const AllSections: Story = { args: { extraSections } };
export const Units: Story = { args: { extraSections }, parameters: { router: { initialEntries: ["/settings?section=units"] } } };

function RetailerSettingsExample(args: ComponentProps<typeof SettingsScreen>) {
  const { t } = useTranslation("shopping");
  return <SettingsScreen {...args} extraSections={[
    { id: "xtra", icon: StoreIcon, title: t("xtra.sectionTitle"), description: t("xtra.sectionDescription"), content: <XtraSettings initial={{ configured: true, connected: true, canUse: true, canManage: false, needsReconnect: false, connectedAt: null, checkedAt: null, placeId: "1234", members: [] }} /> },
    { id: "collect-and-go", icon: ShoppingCartIcon, title: t("collectAndGo.sectionTitle"), description: t("collectAndGo.sectionDescription"), content: <CollectAndGoSettings initial={{ configured: true, enabled: true, connected: true, canUse: true, canManage: false, needsReconnect: false, legacyAvailable: false, importedAt: "2026-11-12T12:00:00Z", members: [] }} /> },
  ]} />;
}
export const RetailerConnections: Story = { render: (args) => <RetailerSettingsExample {...args} /> };
export const XtraInStore: Story = { ...RetailerConnections, parameters: { router: { initialEntries: ["/settings?section=xtra"] } } };
export const CollectAndGoOnline: Story = { ...RetailerConnections, parameters: { router: { initialEntries: ["/settings?section=collect-and-go"] } } };
