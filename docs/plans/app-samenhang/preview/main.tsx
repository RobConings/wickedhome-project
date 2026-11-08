import { VisitAdjust } from "./visit-adjust";
import { HomeRoomMap } from "@/features/dashboard";
import { homeMapFixture } from "../../../../stories/features/dashboard/home-map-fixture";
import { DEVICES_NOW } from "../../../../stories/features/devices/fixtures";
import { RelatedRecordCards } from "./related-records";
import { RecordPhoto } from "./media-patterns";
import { tr, localize } from "./design-i18n";
import { HomePanels } from "./home-panels";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Link,
  useSearchParams,
} from "react-router";
import {
  LightbulbIcon,
  ThermometerIcon,
  ShieldCheckIcon,
  CloudSunIcon,
  MilkIcon,
  CookingPotIcon,
  PaintbrushIcon,
  WashingMachineIcon,
  HouseIcon,
  ListChecksIcon,
  ShoppingCartIcon,
  BoxIcon,
  ChefHatIcon,
  FolderKanbanIcon,
  WalletIcon,
  BanknoteIcon,
  FolderIcon,
  SettingsIcon,
  StoreIcon,
  MapPinIcon,
  CpuIcon,
  CalendarIcon,
  UsersIcon,
  SparklesIcon,
  CheckIcon,
  PlusIcon,
  ChevronRightIcon,
  SearchIcon,
  BotIcon,
  LayersIcon,
  TrophyIcon,
  ArrowRightIcon,
  CircleHelpIcon,
  ReceiptTextIcon,
} from "lucide-react";
import { initI18n, setLocale, currentLocale } from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import {
  AppShell,
  type AppShellNavSection,
} from "@/components/layout/app-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { IconChip } from "@/components/shared/icon-chip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandMark } from "@/components/shared/brand-mark";
import { PageHeader } from "@/components/shared/page-header";
import { BreadcrumbTrail } from "@/components/shared/breadcrumb-trail";
import { Card, CardTitle, CardDescription } from "@/components/shared/card";
import { StatTile } from "@/components/shared/stat-tile";
import { GeneralList } from "@/components/shared/general-list";
import {
  GeneralForm,
  type GeneralFormField,
} from "@/components/shared/general-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { EntityPicker } from "@/components/shared/entity-picker";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { SkeletonList } from "@/components/shared/loading-state";
import { TimelineList } from "@/components/shared/timeline-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type SectionAccent } from "@/lib/section-accent";
import catalog from "../catalog.json";
import dutchCatalog from "../catalog.nl.json";
import "./review.css";

type CatalogPage = (typeof catalog.pages)[number];
type Row = CatalogPage["rows"][number];
type Page = Omit<CatalogPage, "rows"> & { rows: Row[] };
const localPages = (): Page[] =>
  currentLocale() === "nl" ? dutchCatalog.pages : catalog.pages;
const byId = {
  get: (id: string) => localPages().find((p) => p.id === id),
  has: (id: string) => localPages().some((p) => p.id === id),
};
const labels: Record<string, string> = {
  "home-assistant": "Home Assistant",
  catalogue: "Catalogue",
  shopping: "Shopping",
  inventory: "Inventory",
  projects: "Projects",
  tasks: "Tasks",
  money: "Cash flow",
  income: "Income",
  expenses: "Expenses",
  household: "Household",
  places: "Spaces",
  devices: "Devices",
  energy: "Energy",
  documents: "Documents",
  recipes: "Recipes",
  calendar: "Calendar",
  shops: "Shops",
  settings: "Settings",
  integrations: "Connections",
  assistant: "Assistant",
  auth: "Access",
  notifications: "Notifications",
  audit: "Activity",
  automations: "Automations",
  weather: "Weather",
  waste: "Waste",
  contacts: "Contacts",
  dashboard: "Today",
  purchases: "Purchases",
};
const label = new Proxy(labels, {
  get: (target, key: string) => tr(target[key]),
});
const icons: Record<string, typeof HouseIcon> = {
  dashboard: HouseIcon,
  projects: FolderKanbanIcon,
  tasks: ListChecksIcon,
  shopping: ShoppingCartIcon,
  inventory: BoxIcon,
  catalogue: BoxIcon,
  shops: StoreIcon,
  recipes: ChefHatIcon,
  money: WalletIcon,
  income: BanknoteIcon,
  expenses: WalletIcon,
  documents: FolderIcon,
  places: MapPinIcon,
  devices: CpuIcon,
  calendar: CalendarIcon,
  household: UsersIcon,
  assistant: BotIcon,
};
const accent = (o: string): SectionAccent =>
  ["money", "income", "expenses", "projects", "purchases"].includes(o)
    ? "finance"
    : o === "inventory" || o === "catalogue" || o === "shops"
      ? "shopping"
      : (([
          "tasks",
          "shopping",
          "calendar",
          "energy",
          "documents",
          "devices",
          "assistant",
          "integrations",
        ].includes(o)
          ? o
          : "home") as SectionAccent);
const href = (id: string, from?: string) =>
  `${import.meta.env.PROD ? "./index.html" : `/wireframe/${byId.get(id)?.owner ?? "dashboard"}/${id}`}?screen=${id}&embed=1&lang=${currentLocale()}${from ? `&from=${from}` : ""}`;
const navHref = (id: string) =>
  `${import.meta.env.PROD ? "./index.html" : `/wireframe/${byId.get(id)?.owner ?? "dashboard"}`}?screen=${id}&embed=1&lang=${currentLocale()}`;

const selections = [
  {
    id: "group-colruyt",
    label: "Colruyt group",
    description: "Colruyt + Collect&Go · saved shop group",
    leading: <LayersIcon className="size-5" />,
  },
  {
    id: "gamma",
    label: "Gamma",
    description: "One shop · recently used",
    leading: <StoreIcon className="size-5" />,
  },
  {
    id: "colruyt",
    label: "Colruyt",
    description: "One shop",
    leading: <StoreIcon className="size-5" />,
  },
];
const productOptions = [
  {
    id: "kit",
    label: "White mounting adhesive",
    description: "3 cartridges in garage · 2 needed for bathroom",
  },
  {
    id: "screws",
    label: "Screws",
    description: "1 box · linked to bathroom",
  },
  {
    id: "milk",
    label: "Boni semi-skimmed milk 1 l",
    description: "2 packs on shopping list",
  },
  {
    id: "alternative",
    label: "Linked alternative",
    description: "Same product group · check the unit",
  },
];
const relatedKinds: Record<
  string,
  { icon: typeof HouseIcon; accent: SectionAccent }
> = {
  "project-tasks": { icon: ListChecksIcon, accent: "tasks" },
  "project-materials": { icon: BoxIcon, accent: "shopping" },
  "project-purchases": { icon: ReceiptTextIcon, accent: "finance" },
  "project-costs": { icon: WalletIcon, accent: "finance" },
  "project-documents": { icon: FolderIcon, accent: "documents" },
  "purchase-detail": { icon: ReceiptTextIcon, accent: "finance" },
  "product-stock": { icon: BoxIcon, accent: "shopping" },
  "product-projects": { icon: FolderKanbanIcon, accent: "finance" },
  "product-shops": { icon: StoreIcon, accent: "shopping" },
  "expense-detail": { icon: WalletIcon, accent: "finance" },
  "expenses-history": { icon: WalletIcon, accent: "finance" },
  "account-detail": { icon: WalletIcon, accent: "finance" },
  "recipe-cooking": { icon: ChefHatIcon, accent: "home" },
};
const primaryTargets: Record<string, string> = {
  house: "room-live",
  "house-live": "room-live",
  "home-assistant": "ha-connection",
  "ha-entities": "ha-map",
  contacts: "contact-form-dialog",
  habitants: "habitant-form-dialog",
  places: "place-form-dialog",
  "place-detail": "place-form-dialog",
  "floor-plan": "plan-import-dialog",
  "calendar-event": "calendar-entry-dialog",
  "documents-folder": "folder-form-dialog",
  "energy-appliances": "appliance-form-dialog",
  "device-detail": "device-live-controls",
  "device-profiles": "device-profile",
  "automation-detail": "settings-automations",
  weather: "settings-weather",
  waste: "settings-waste",
  logout: "login",
  dashboard: "global-search",
  shopping: "add-shopping-item-dialog",
  "shopping-sessions": "visit-start",
  "shopping-shop-view": "visit-start",
  "shopping-one-shop": "visit-start",
  "visit-active": "visit-summary",
  "visit-summary": "payment-link",
  "visit-receipts": "attach-document-dialog",
  "shopping-staples": "staple-form-dialog",
  projects: "project-form-dialog",
  "project-detail": "task-detail",
  "project-tasks": "task-form-dialog",
  "project-materials": "add-shopping-item-dialog",
  "project-purchases": "purchase-allocation",
  "project-costs": "link-to-project-dialog",
  "project-documents": "attach-document-dialog",
  tasks: "task-form-dialog",
  "task-detail": "complete-task-dialog",
  inventory: "inventory-scan",
  "inventory-product": "product-form-dialog",
  "product-stock": "stock-item-form-dialog",
  "product-projects": "project-detail",
  "product-shops": "product-link-form-dialog",
  purchases: "visit-start",
  "purchase-detail": "attach-document-dialog",
  expenses: "expense-form-dialog",
  "expense-detail": "mark-expense-paid-dialog",
  "expenses-history": "log-expense-dialog",
  "expenses-recurring": "expense-form-dialog",
  income: "income-form-dialog",
  "income-detail": "income-form-dialog",
  money: "record-transfer-dialog",
  "account-detail": "record-transfer-dialog",
  "shopping-products": "product-form-dialog",
  shops: "shop-form-dialog",
  "shop-groups": "shop-group-form",
  documents: "attach-document-dialog",
  recipes: "recipe-form-dialog",
  "recipes-all": "recipe-form-dialog",
  "recipe-detail": "recipe-check-dialog",
  "recipe-cooking": "cook-summary",
  "cook-summary": "recipes",
  settings: "settings-household",
  integrations: "integration-health",
  bills: "expenses",
  "bill-redirect": "expense-detail",
  subscriptions: "expenses-recurring",
  "subscription-redirect": "recurring-expense-detail",
  "not-found": "dashboard",
  calendar: "calendar-event-form-dialog",
  devices: "device-form-dialog",
};
function listLink(p: Page, r: Row) {
  return href(r.to || p.id, p.id);
}
function View() {
  useTranslation();
  const pages = localPages();
  const [params, setParams] = useSearchParams();
  const id = params.get("screen") || "project-detail";
  const p = byId.get(id) || pages[0]!;
  const embedded = params.get("embed") === "1";
  const [owner, setOwner] = useState("all");
  const [size, setSize] = useState(
    params.get("size") === "mobile" ? "mobile" : "desktop",
  );
  const [theme, setTheme] = useState("light");
  const [state, setState] = useState("normal");
  const [frameInfo, setFrameInfo] = useState({
    id: p.id,
    from: params.get("from") || "",
  });
  React.useEffect(() => {
    setFrameInfo({ id: p.id, from: params.get("from") || "" });
  }, [p.id, params.get("from")]);
  React.useEffect(() => {
    if (embedded) return;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== "wickedhome-design-screen" ||
        !byId.has(event.data.id)
      )
        return;
      const next = byId.get(event.data.id)!;
      setFrameInfo({
        id: next.id,
        from: typeof event.data.from === "string" ? event.data.from : "",
      });
      setOwner((current) =>
        current === "all" || current === next.owner ? current : "all",
      );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [embedded]);
  const shown = byId.get(frameInfo.id) || p;
  const changeLanguage = async (lang: "en" | "nl") => {
    await setLocale(lang);
    setParams({
      screen: shown.id,
      lang,
      ...(frameInfo.from ? { from: frameInfo.from } : {}),
    });
  };
  const retainFrame = () =>
    setParams({
      screen: shown.id,
      lang: currentLocale(),
      ...(frameInfo.from ? { from: frameInfo.from } : {}),
    });

  if (embedded)
    return (
      <Preview
        key={p.id + params.get("state")}
        p={p}
        state={params.get("state") || "normal"}
        theme={params.get("theme") || "light"}
      />
    );
  const options = pages
    .filter((x) => owner === "all" || x.owner === owner)
    .map((x) => ({
      id: x.id,
      label: x.title,
      description: `${label[x.owner]} · ${x.kind} · ${x.currentRoute || tr("proposed / subview")}`,
    }));
  return (
    <div className="review-root">
      <header className="review-head">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {tr("New design · fictional data")}
          </p>
          <h1 className="text-xl font-semibold">{tr("One WickedHome")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/walkthrough.html">{tr("View 16 annotated screens")}</a>
          </Button>
          <Badge variant="secondary">{catalog.meta.pageCount} wireframes</Badge>
          <Badge variant="secondary">
            {catalog.meta.featureCount} features
          </Badge>
          <Badge variant="secondary">{tr("Real shared components")}</Badge>
        </div>
      </header>
      <section
        className="review-tools"
        aria-label={tr("Browse the design atlas")}
      >
        <EntityPicker
          items={[
            { id: "all", label: tr("All areas") },
            ...catalog.meta.features.map((o) => ({
              id: o,
              label: label[o] ?? o,
            })),
            { id: "catalogue", label: tr("Catalogue (proposed)") },
            { id: "purchases", label: tr("Purchases (proposed)") },
          ]}
          value={owner}
          onChange={(v) => setOwner(v || "all")}
          placeholder={tr("Choose an area")}
        />
        <EntityPicker
          items={options}
          value={shown.id}
          onChange={(v) => {
            if (v) setParams({ screen: v, lang: currentLocale() });
          }}
          favoriteIds={[
            "project-detail",
            "house",
            "live",
            "visit-start",
            "visit-active",
            "money",
            "inventory-product",
          ]}
          recentIds={["shopping", "purchase-detail", "expense-detail"]}
          placeholder={tr("Find a page or dialog")}
        />
        <SegmentedControl
          label={tr("Preview size")}
          value={size}
          onChange={(next) => {
            retainFrame();
            setSize(next);
          }}
          options={[
            { value: "desktop", label: "Desktop" },
            { value: "mobile", label: tr("Mobile") },
          ]}
        />
        <SegmentedControl
          label={tr("Theme")}
          value={theme}
          onChange={(next) => {
            retainFrame();
            setTheme(next);
          }}
          options={[
            { value: "light", label: tr("Light") },
            { value: "dark", label: tr("Dark") },
          ]}
        />
        <EntityPicker
          items={[
            ["normal", tr("Normal")],
            ["empty", tr("Empty")],
            ["loading", tr("Loading")],
            ["error", tr("Error")],
            ["denied", tr("No access")],
            ["conflict", tr("Changed by someone else")],
            ["offline", tr("Source offline")],
            ["stale", tr("Stale source")],
          ].map(([id, label]) => ({ id: id!, label: label! }))}
          value={state}
          onChange={(v) => {
            retainFrame();
            setState(v || "normal");
          }}
        />
      </section>
      <div className="review-links">
        <SegmentedControl
          label="Language / Taal"
          value={currentLocale()}
          onChange={changeLanguage}
          options={[
            { value: "en", label: "English" },
            { value: "nl", label: tr("Dutch") },
          ]}
        />
        <span>{tr("Try this journey:")}</span>
        {[
          "project-detail",
          "project-materials",
          "purchase-detail",
          "expense-detail",
          "money",
          "visit-start",
          "shopping",
        ].map((x) => (
          <Button
            key={x}
            variant="ghost"
            size="sm"
            onClick={() => setParams({ screen: x, lang: currentLocale() })}
          >
            {byId.get(x)?.title}
          </Button>
        ))}
      </div>
      <div className="preview-wrap" data-format={size}>
        <iframe
          title={`${p.title} — ${size}`}
          key={p.id + size + theme + state + currentLocale()}
          src={`${href(p.id, params.get("from") || undefined)}&theme=${theme}&state=${state}`}
          style={{
            width: size === "mobile" ? 390 : "100%",
            maxWidth: "100%",
            height: size === "mobile" ? 844 : 920,
          }}
        />
      </div>
      <details className="review-inspector">
        <summary>
          {tr("Ownership, components and source for this wireframe")}
        </summary>
        <p>
          <strong>{shown.title}</strong> · {tr("owner/panel:")}{" "}
          {label[shown.owner]} · {tr("pattern:")} {shown.kind} · route:{" "}
          {shown.route || tr("Dialog or proposed view")}
        </p>
        <p>{shown.goal}</p>
        <p>
          {tr("Source:")}{" "}
          {shown.source.join(", ") ||
            tr("New composition using existing building blocks.")}
        </p>
        <p>
          {tr("Shared components:")}
          {catalog.meta.components.join(", ")}
          {tr(
            ". The atlas imports these from src/components; domain validation and real services are not called here.",
          )}
        </p>
        {shown.sourceFields && (
          <p>
            {tr("Inventoried source fields:")}{" "}
            {shown.sourceFields.join(", ") ||
              tr(
                "Fields come from the underlying domain components; see the source file.",
              )}
          </p>
        )}
      </details>
    </div>
  );
}
function Preview({
  p: sourcePage,
  state,
  theme,
}: {
  p: Page;
  state: string;
  theme: string;
}) {
  useTranslation();
  const pages = localPages();
  const [params] = useSearchParams();
  const selectedShop = params.get("destination");
  const destinationName = localize(selections).find(
    (x) => x.id === selectedShop,
  )?.label;
  const p: Page =
    sourcePage.id === "visit-active" && destinationName
      ? {
          ...sourcePage,
          title: `${destinationName} · ${tr("Shopping trip")}`,
          rows:
            selectedShop === "gamma"
              ? byId
                  .get("purchase-detail")!
                  .rows.map((r) => ({ ...r, to: "visit-item-adjust" }))
              : selectedShop === "colruyt"
                ? sourcePage.rows.slice(0, 2)
                : sourcePage.rows,
        }
      : sourcePage;
  React.useEffect(() => {
    if (window.parent !== window)
      window.parent.postMessage(
        {
          type: "wickedhome-design-screen",
          id: p.id,
          from: params.get("from") || "",
        },
        window.location.origin,
      );
  }, [p.id, params.get("from")]);

  const [adjustingRow, setAdjustingRow] = useState<{ label: string; meta: string; selectedVariant?: boolean } | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, { name: string; quantity: number }>>({});
  const [dialog, setDialog] = useState(p.kind === "dialog");
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState("all");
  const [destination, setDestination] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState(["group-colruyt"]);
  const [groupShops, setGroupShops] = useState<string[]>(["colruyt"]);
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang =
      currentLocale() === "nl" ? "nl-BE" : "en-BE";
  }, [theme, currentLocale()]);
  const Icon = icons[p.owner] || HouseIcon;
  const go = (id: string) => {
    window.location.assign(
      href(id, p.id) +
        (destination || selectedShop
          ? `&destination=${destination || selectedShop}`
          : ""),
    );
  };
  const baseId =
    pages.find((x) => x.owner === p.owner && x.kind !== "dialog")?.id ||
    "dashboard";
  const nav: AppShellNavSection[] = [
    {
      label: tr("Daily life"),
      items: [
        ["dashboard", tr("Today"), HouseIcon],
        ["tasks", tr("Tasks"), ListChecksIcon],
        ["projects", tr("Projects"), FolderKanbanIcon],
        ["shopping", tr("Shopping"), ShoppingCartIcon],
        ["inventory", tr("Inventory"), BoxIcon],
        ["recipes", tr("Recipes"), ChefHatIcon],
        ["calendar", tr("Calendar"), CalendarIcon],
      ].map(([id, text, icon]) => ({
        to: navHref(id as string),
        label: text as string,
        icon: icon as typeof HouseIcon,
        accent: accent(byId.get(id as string)?.owner || "home"),
        end: false,
      })),
    },
    {
      label: tr("Money"),
      items: [
        ["money", tr("Cash flow"), WalletIcon],
        ["income", tr("Income"), BanknoteIcon],
        ["expenses", tr("Expenses"), WalletIcon],
        ["purchases", tr("Purchases"), StoreIcon],
      ].map(([id, text, icon]) => ({
        to: navHref(id as string),
        label: text as string,
        icon: icon as typeof HouseIcon,
        accent: "finance" as const,
        end: false,
      })),
    },
    {
      label: tr("Home and library"),
      items: [
        ["house", tr("Our home"), HouseIcon],
        ["places", tr("Spaces"), MapPinIcon],
        ["devices", tr("Devices"), CpuIcon],
        ["energy", tr("Energy"), SparklesIcon],
        ["shopping-products", tr("Products"), BoxIcon],
        ["shops", tr("Shops and groups"), StoreIcon],
        ["documents", tr("Documents"), FolderIcon],
        ["assistant", tr("Assistant"), BotIcon],
        ["settings", tr("Manage"), SettingsIcon],
      ].map(([id, text, icon]) => ({
        to: navHref(id as string),
        label: text as string,
        icon: icon as typeof HouseIcon,
        end: false,
      })),
    },
  ];
  const selectionItems = (field: string) => {
    if (/winkel|shop/i.test(field))
      return localize(selections).filter(
        (x) => p.id !== "shop-group-form" || !x.id.startsWith("group-"),
      );
    if (/product|variant|alternative|alternatief/i.test(field))
      return localize(productOptions);
    if (/entiteit|entity/i.test(field))
      return [
        {
          id: "living-light",
          label: tr("Living room lamp"),
          description: "Home Assistant · light.living_room",
        },
        {
          id: "room-temp",
          label: tr("Living room temperature"),
          description: "Home Assistant · sensor.living_room_temperature",
        },
      ];
    if (/toestel|device|appliance|profiel|profile/i.test(field))
      return [
        {
          id: "washer",
          label: tr("Washing machine"),
          description: tr("Laundry room"),
        },
      ];
    if (/project|doel|purpose/i.test(field))
      return [
        {
          id: "project",
          label: tr("Bathroom renovation"),
          description: tr("Project · active"),
        },
        {
          id: "household",
          label: tr("Household"),
          description: tr("No project allocation"),
        },
      ];
    if (/rekening|account/i.test(field))
      return [
        {
          id: "joint",
          label: tr("Joint account"),
          description: tr("Payment account"),
        },
      ];
    if (/uitgave|expense/i.test(field))
      return [
        {
          id: "gamma-expense",
          label: "Gamma · €45",
          description: tr("Existing paid expense"),
        },
      ];
    if (/taak|task/i.test(field))
      return [
        {
          id: "cabinet-task",
          label: tr("Install the bathroom cabinet"),
          description: tr("Bathroom renovation"),
        },
      ];
    if (/map|folder/i.test(field))
      return [
        {
          id: "bathroom-folder",
          label: tr("Bathroom"),
          description: tr("Document folder"),
        },
      ];
    if (/locatie|ruimte|location|space|room/i.test(field))
      return [
        { id: "garage", label: "Garage", description: tr("Stock location") },
        {
          id: "pantry",
          label: tr("Pantry"),
          description: tr("Stock location"),
        },
      ];
    return [
      { id: "rob", label: "Rob", description: tr("Resident") },
      { id: "cindy", label: "Cindy", description: tr("Resident") },
    ];
  };
  const selectField = (field: string, index: number): GeneralFormField => {
    const name = `field${index}`;
    if (p.id === "shop-group-form" && index === 1)
      return {
        name,
        label: field,
        type: "custom",
        render: () => (
          <div className="grid gap-3">
            <EntityPicker
              value={null}
              items={selectionItems(field).filter(
                (x) => !groupShops.includes(x.id),
              )}
              onChange={(id) => {
                if (id) setGroupShops((xs) => [...xs, id]);
              }}
              placeholder={tr("Add a shop")}
            />
            {groupShops.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <span>{selections.find((x) => x.id === id)?.label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setGroupShops((xs) => xs.filter((x) => x !== id))
                  }
                >
                  {tr("Remove")}
                </Button>
              </div>
            ))}
          </div>
        ),
      };

    if (/bedrag|budget|tarief|amount|rate/i.test(field))
      return { name, label: field, type: "money", optional: true };
    if (
      /aantal|minimum|quantity|count/i.test(field) &&
      !field.includes("per product")
    )
      return { name, label: field, type: "number", min: 0, step: 1 };
    if (/essentieel|actief|essential|active|favourite|favoriet/i.test(field))
      return { name, label: field, type: "switch" };
    if (
      /notitie|toelichting|beschrijving|note|explanation|description/i.test(
        field,
      )
    )
      return { name, label: field, type: "textarea", optional: true };
    if (/datum|begindatum|einddatum|houdbaar|date|expiry/i.test(field))
      return { name, label: field, type: "date", optional: true };
    if (
      /product|winkel|locatie|ruimte|project|betaler|rekening|ontvanger|taak|bewoner|eigenaar|entiteit|map|profiel|shop|location|space|payer|account|recipient|task|resident|owner|entity|folder|profile|expense|uitgave|device|toestel|purpose|doel/i.test(
        field,
      )
    )
      return {
        name,
        label: field,
        type: "custom",
        optional: true,
        render: ({ id, value, setValue }) => (
          <EntityPicker
            id={id}
            name={name}
            value={typeof value === "string" ? value : null}
            onChange={setValue}
            items={selectionItems(field)}
            favoriteIds={/winkel|shop/i.test(field) ? favorites : ["project"]}
            recentIds={["rob", "garage"]}
            onToggleFavorite={(x) =>
              setFavorites((a) =>
                a.includes(x) ? a.filter((v) => v !== x) : [...a, x],
              )
            }
            placeholder={`${tr("Choose")} ${field}`}
          />
        ),
      };
    return { name, label: field, type: "text", optional: index > 1 };
  };
  const fields = p.fields.map(selectField);
  const onPrimary = () => {
    if (primaryTargets[p.id]) go(primaryTargets[p.id]!);
    else if (p.id === "notifications" || p.kind === "connections")
      setSaved(true);
    else setDialog(true);
  };
  const photoCards = [
    "projects",
    "recipes",
    "catalogue",
    "inventory",
    "devices",
  ].includes(p.owner);
  const row = (r: Row, _i: number) => (
    <div className="flex min-w-0 items-center gap-3 py-3">
      {photoCards || r.mediaKey ? (
        <RecordPhoto
          mediaKey={r.mediaKey}
          alt={r.label}
          shape="thumbnail"
          icon={
            /melk|milk/i.test(r.label)
              ? MilkIcon
              : /tomaten|soep|tomato|soup/i.test(r.label)
                ? CookingPotIcon
                : /kit|roller|adhesive/i.test(r.label)
                  ? PaintbrushIcon
                  : /wasmachine|washing machine/i.test(r.label)
                    ? WashingMachineIcon
                    : (icons[byId.get(r.to)?.owner ?? ""] ?? Icon)
          }
        />
      ) : (
        <IconChip
          icon={icons[byId.get(r.to)?.owner ?? ""] ?? Icon}
          tone={accent(byId.get(r.to)?.owner ?? p.owner)}
        />
      )}
      <Link to={listLink(p, r)} className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-medium">
          {r.label}
        </strong>
        <span className="block text-xs text-muted-foreground">{r.meta}</span>
      </Link>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </div>
  );
  const tripWorkspace = ["visit-start", "visit", "visit-summary"].includes(
    p.kind,
  );
  const record = [
    "detail",
    "product",
    "project",
    "recipe",
    "expense",
    "purchase",
    "costs",
    "task",
    "money",
    "visit-summary",
  ].includes(p.kind);
  const relations = p.id.startsWith("project-")
    ? byId.get("project-detail")!.relations
    : p.id.startsWith("product-") || p.id === "inventory-product"
      ? byId.get("inventory-product")!.relations
      : p.relations;
  const relationNav =
    !tripWorkspace &&
    (record || p.id.startsWith("project-") || p.id.startsWith("product-"));
  const areas =
    p.owner === "shopping" && !tripWorkspace
      ? [
          ["shopping", tr("List")],
          ["shopping-sessions", tr("Shopping trips")],
          ["shopping-staples", tr("Recurring items")],
        ]
      : ["expenses", "income", "money"].includes(p.owner)
        ? [
            ["money", tr("Cash flow")],
            ["income", tr("Income")],
            ["expenses", tr("Expenses")],
          ]
        : p.owner === "shops"
          ? [
              ["shops", tr("Shops")],
              ["shop-groups", tr("Shop groups")],
            ]
          : [];
  let listRows = p.rows;
  if (p.id === "shopping")
    listRows =
      filter === "out"
        ? p.rows.slice(0, 1)
        : filter === "nearly"
          ? p.rows.slice(1, 2)
          : p.rows;
  if (filter !== "all" && p.owner !== "shopping") {
    const donePattern =
      p.owner === "income"
        ? /ontvangen|received/i
        : p.owner === "expenses"
          ? /^(Betaald|Paid)/i
          : /afgerond|klaar|voldoende|gekoppeld|completed|done|sufficient|linked/i;
    listRows = p.rows.filter((r) =>
      filter === "done" ? donePattern.test(r.meta) : !donePattern.test(r.meta),
    );
  }
  const list = (
    <GeneralList
      className={photoCards ? "photo-record-list" : undefined}
      label={p.title}
      items={listRows}
      getKey={(r) => r.label}
      renderRow={(r) => row(r, 0)}
      renderTile={(r) =>
        photoCards ? (
          <Card className="gap-0 overflow-hidden p-0">
            <Link to={listLink(p, r)} aria-label={r.label}>
              <RecordPhoto
                mediaKey={r.mediaKey}
                alt={r.label}
                shape="tile"
                icon={Icon}
              />
            </Link>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <Link
                to={listLink(p, r)}
                className="font-semibold hover:underline"
              >
                {r.label}
              </Link>
              <p className="text-sm text-muted-foreground">{r.meta}</p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-auto self-start"
              >
                <Link to={listLink(p, r)}>
                  {tr("Open")}
                  <ChevronRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Card>{row(r, 0)}</Card>
        )
      }
      search={{ keys: (r) => [r.label, r.meta] }}
      defaultView={p.kind === "cards" ? "tiles" : "list"}
      storageKey={`design-${p.id}`}
      viewParam="view"
      emptyState={
        <EmptyState
          icon={Icon}
          title={tr("Nothing added yet")}
          description={tr("Add something or link an existing record.")}
          action={<Button onClick={onPrimary}>{p.primary}</Button>}
        />
      }
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            label={tr("Filter the list")}
            value={filter}
            onChange={setFilter}
            options={
              p.owner === "shopping"
                ? [
                    { value: "all", label: tr("All") },
                    { value: "out", label: tr("Out") },
                    { value: "nearly", label: tr("Nearly out") },
                  ]
                : [
                    { value: "all", label: p.filters[0] || tr("All") },
                    { value: "active", label: p.filters[1] || tr("Active") },
                    { value: "done", label: p.filters[2] || tr("Handled") },
                  ]
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => go("filter-panel")}
          >
            {tr("Filters and grouping")}
          </Button>
        </div>
      }
    />
  );
  const form = (
    <GeneralForm
      fields={fields}
      submitLabel={p.primary}
      onSuccess={() => setSaved(true)}
    />
  );
  const progress = (
    title: string,
    n: number,
    total: number,
    detail: string,
    compact = false,
  ) => (
    <Card
      tone={n === total ? "success" : "featured"}
      className={compact ? "gap-2" : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {!compact && <CardDescription>{detail}</CardDescription>}
        </div>
        <IconChip
          icon={TrophyIcon}
          tone="highlight"
          className="size-12 rounded-2xl [&_svg]:size-6"
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>
          {n} {tr("of")} {total} {tr("completed")}
        </span>
        <strong>{Math.round((n / total) * 100)}%</strong>
      </div>
      <Progress value={(n / total) * 100} />
      {compact ? (
        <p className="text-xs text-muted-foreground">{detail}</p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex -space-x-2">
            <Avatar className="size-7 border-2 border-card">
              <AvatarFallback>R</AvatarFallback>
            </Avatar>
            <Avatar className="size-7 border-2 border-card">
              <AvatarFallback>C</AvatarFallback>
            </Avatar>
          </div>
          {tr("Together with Rob and Cindy")}
        </div>
      )}
    </Card>
  );
  let content: React.ReactNode = list;
  if (p.kind === "project")
    content = (
      <>
        {progress(
          tr("Working towards a renewed bathroom"),
          1,
          3,
          tr("Next step: install the bathroom cabinet"),
        )}
        <PageGrid columns="stats">
          <StatTile
            label={tr("Spent")}
            value="€ 460"
            hint={tr("Actual project costs, counted once")}
          />
          <StatTile
            label={tr("Still planned")}
            value="€ 340"
            hint={tr("€40 invoice + €300 estimate")}
            tone="soon"
          />
          <StatTile
            label={tr("Remaining")}
            value="€ 1.700"
            hint={tr("From a €2,500 budget")}
            tone="positive"
          />
        </PageGrid>
        <Card>
          <CardTitle>{tr("Next achievable step")}</CardTitle>
          <CardDescription>
            {tr(
              "The materials have been purchased. Rob and Cindy can start together.",
            )}
          </CardDescription>
          <Button asChild>
            <Link to={href("task-detail", p.id)}>
              {tr("Install the bathroom cabinet")}
              <ArrowRightIcon />
            </Link>
          </Button>
        </Card>
        <PageGrid columns="2">
          <Card>
            <CardTitle>{tr("Requirements")}</CardTitle>
            {byId.get("project-materials")!.rows.slice(0, 2).map(row)}
          </Card>
          <Card>
            <CardTitle>{tr("Recently linked")}</CardTitle>
            {byId.get("project-purchases")!.rows.map(row)}
          </Card>
        </PageGrid>
      </>
    );
  if (p.kind === "product")
    content = (
      <>
        <PageGrid columns="stats">
          <StatTile
            label={tr("At home")}
            value={tr("3 cartridges")}
            hint={tr("Garage · actual stock")}
          />
          <StatTile
            label={tr("Required for task")}
            value={tr("2 cartridges")}
            hint={tr("Install the bathroom cabinet")}
          />
          <StatTile
            label={tr("Latest purchase")}
            value="€ 19"
            hint="2 × € 9,50 · Gamma"
          />
        </PageGrid>
        <Card>
          <CardTitle>{tr("White mounting adhesive")}</CardTitle>
          <CardDescription>
            {tr(
              "The catalogue owns identity; stock and project use come from their own features.",
            )}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{tr("DIY materials")}</Badge>
            <Badge variant="secondary">{tr("Unit: cartridge")}</Badge>
            <Badge variant="secondary">{tr("No weight required")}</Badge>
          </div>
        </Card>
        {list}
      </>
    );
  if (p.kind === "money")
    content = (
      <>
        <PageGrid columns="stats">
          <StatTile
            label={tr("Actual balance")}
            value="€ 2.398"
            hint={tr("On the joint account")}
            tone="featured"
          />
          <StatTile
            label={tr("Still to pay")}
            value="€ 100"
            hint={tr("Not yet debited")}
            tone="soon"
          />
          <StatTile
            label={tr("Projected after payments")}
            value="€ 2.298"
            hint={tr("Projection, not an actual balance")}
          />
        </PageGrid>
        <Card>
          <CardTitle>{tr("From opening balance to now")}</CardTitle>
          <TimelineList
            items={[
              {
                id: "start",
                time: "1 nov",
                icon: <WalletIcon />,
                title: tr("Opening balance €1,200"),
                subtitle: tr("Actual account balance"),
              },
              {
                id: "in",
                time: "nov",
                icon: <PlusIcon />,
                title: tr("Contributions + €2,800"),
                subtitle: tr(
                  "Actually transferred · not a second salary entry",
                ),
              },
              {
                id: "out",
                time: "nov",
                icon: <StoreIcon />,
                title: tr("Paid expenses − €1,602"),
                subtitle: tr(
                  "Rent €1,000 + energy €132 + sanitaryware €425 + Gamma €45",
                ),
                href: href("expenses-history", p.id),
              },
            ]}
          />
        </Card>
        {list}
      </>
    );
  if (p.kind === "costs")
    content = (
      <>
        <PageGrid columns="stats">
          <StatTile label={tr("Spent")} value="€ 460" />
          <StatTile label={tr("Planned")} value="€ 340" />
          <StatTile label={tr("Remaining")} value="€ 1.700" />
        </PageGrid>
        <Card tone="attention">
          <CardTitle>{tr("Gamma: €35 for this project")}</CardTitle>
          <CardDescription>
            {tr(
              "The receipt and expense total €45. Adhesive and screws account for €35; the €10 roller belongs to the household. The account is debited once for €45.",
            )}
          </CardDescription>
        </Card>
        {list}
      </>
    );
  if (p.kind === "expense" || p.kind === "purchase")
    content = (
      <>
        <PageGrid columns="stats">
          <StatTile
            label={tr("Purchase / expense")}
            value="€ 45,00"
            hint={tr("One actually paid receipt")}
          />
          <StatTile
            label={tr("For the bathroom")}
            value="€ 35,00"
            hint={tr("Adhesive and screws")}
          />
          <StatTile
            label={tr("For the household")}
            value="€ 10,00"
            hint={tr("Paint roller")}
          />
        </PageGrid>
        <Card tone="success">
          <CardTitle>{tr("Linked and checked")}</CardTitle>
          <CardDescription>
            {tr(
              "Receipt → purchase lines → stock → expense → cash flow. Open a related record to trace its source.",
            )}
          </CardDescription>
        </Card>
        {p.kind === "purchase" ? (
          list
        ) : (
          <Card>
            <CardTitle>{tr("Payment")}</CardTitle>
            <p>{tr("Joint account · paid by Rob · 7 November 2026")}</p>
            <Button asChild variant="outline">
              <Link to={href("purchase-detail", p.id)}>
                {tr("View the 3 purchase lines")}
              </Link>
            </Button>
          </Card>
        )}
      </>
    );
  if (p.kind === "visit-start")
    content = (
      <Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="highlight">1</Badge>{" "}
          {tr("Choose where you are shopping")}{" "}
          <ArrowRightIcon className="size-4" /> Checklist
        </div>
        <CardTitle>{tr("One shop or one shop group")}</CardTitle>
        <EntityPicker
          items={localize(selections)}
          value={destination}
          onChange={setDestination}
          favoriteIds={favorites}
          recentIds={["gamma"]}
          onToggleFavorite={(x) =>
            setFavorites((a) =>
              a.includes(x) ? a.filter((y) => y !== x) : [...a, x],
            )
          }
          className="min-h-14"
          placeholder={tr("Choose a shop or shop group")}
        />
        <CardDescription>
          {tr(
            "Favourites and recently used choices come first. A group already defines its shops; there is no second shop checklist.",
          )}
        </CardDescription>
        {destination && (
          <div className="rounded-xl bg-section-soft p-4 text-sm">
            <strong>
              {localize(selections).find((x) => x.id === destination)?.label}
            </strong>
            <p>
              {tr(
                "Matching shopping needs automatically become your checklist. Change quantities, choose alternatives, add extras or skip items as you shop.",
              )}
            </p>
          </div>
        )}
        <Button disabled={!destination} onClick={() => go("visit-active")}>
          {tr("Start shopping")}
          <ArrowRightIcon />
        </Button>
        <Button variant="ghost" onClick={() => go("shop-groups")}>
          {tr("Manage shop groups")}
        </Button>
      </Card>
    );
  if (p.kind === "visit")
    content = (
      <>
        {adjustingRow && <VisitAdjust row={adjustingRow} onClose={() => setAdjustingRow(null)} onAdjusted={(quantity, name) => setAdjustments((previous) => ({ ...previous, [adjustingRow.label]: { quantity, name } }))} />} 
        {progress(
          done.size + skip.size === p.rows.length
            ? tr("Ready for checkout")
            : tr("Finish the trip together"),
          done.size + skip.size,
          p.rows.length,
          `${done.size} ${tr("picked up")} · ${skip.size} ${tr("not now")} · Rob ${tr("and")} Cindy`,
          true,
        )}
        <Card>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>
              {destinationName
                ? `${tr("Checklist")} · ${destinationName}`
                : tr("Checklist · Colruyt group")}
            </CardTitle>
            <Badge variant="success">{tr("Live updates connected")}</Badge>
          </div>
          {p.rows.map((r) => (
            <div
              key={adjustments[r.label]?.name ?? r.label}
              className="flex min-w-0 items-center gap-3 border-b py-3 last:border-0"
            >
              <Button
                variant={done.has(r.label) ? "secondary" : "outline"}
                size="icon"
                className="size-12 shrink-0 rounded-full"
                aria-label={`${adjustments[r.label]?.name ?? r.label} ${done.has(r.label) ? tr("undo") : tr("purchased")}`}
                aria-pressed={done.has(r.label)}
                onClick={() => {
                  setSkip((a) => new Set([...a].filter((x) => x !== r.label)));
                  setDone((a) => {
                    const b = new Set(a);
                    if (b.has(r.label)) b.delete(r.label);
                    else b.add(r.label);
                    return b;
                  });
                }}
              >
                {done.has(r.label) && <CheckIcon />}
              </Button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${done.has(r.label) ? "line-through text-muted-foreground" : ""}`}
                >
                  {adjustments[r.label]?.name ?? r.label}
                </p>
                <p className="text-xs text-muted-foreground">{adjustments[r.label] ? `${adjustments[r.label]!.quantity}${r.meta.replace(/^\d+(?:[.,]\d+)?/, "")}` : r.meta}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdjustingRow({ label: r.label, selectedVariant: Boolean(adjustments[r.label] && adjustments[r.label]!.name !== r.label), meta: `${adjustments[r.label]?.quantity ?? ""} ${adjustments[r.label] ? `${adjustments[r.label]!.quantity}${r.meta.replace(/^\d+(?:[.,]\d+)?/, "")}` : r.meta}` })}
                >
                  {tr("Adjust")}
                </Button>
                <Button
                  variant={skip.has(r.label) ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setDone(
                      (a) => new Set([...a].filter((x) => x !== r.label)),
                    );
                    setSkip((a) => {
                      const b = new Set(a);
                      if (b.has(r.label)) b.delete(r.label);
                      else b.add(r.label);
                      return b;
                    });
                  }}
                >
                  {skip.has(r.label) ? tr("Restore item") : tr("Not now")}
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => go("visit-add-extra")}>
            <PlusIcon /> {tr("Add an extra item")}
          </Button>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => go("visit-receipts")}>
            {tr("View receipt or expense")}
          </Button>
          {done.size + skip.size < p.rows.length ? (
            <ConfirmDialog
              trigger={<Button>{tr("Finish the trip")}</Button>}
              title={tr("Some items are still open")}
              description={tr(
                "The remaining items will be marked Not now. They are not purchased and do not increase stock.",
              )}
              confirmLabel={tr("Skip the rest and finish")}
              cancelLabel={tr("Continue shopping")}
              onConfirm={() => go("visit-summary")}
            />
          ) : (
            <Button onClick={() => go("visit-summary")}>
              {tr("Finish the trip")}
            </Button>
          )}
        </div>
      </>
    );
  if (p.kind === "visit-summary")
    content = (
      <>
        <Card tone="success">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{tr("Shopping done")}</CardTitle>
              <CardDescription>{tr("2 purchased · 1 skipped")}</CardDescription>
            </div>
            <IconChip icon={TrophyIcon} tone="highlight" className="size-12" />
          </div>
          <Progress value={100} />
        </Card>
        <Card>
          <CardTitle>{tr("Your purchases and stock")}</CardTitle>
          <div className="flex items-start gap-3 border-b pb-3">
            <IconChip icon={MilkIcon} tone="shopping" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {tr("Boni semi-skimmed milk 1 l")}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr("2 packs · Pantry stock updated once")}
              </p>
            </div>
            <CheckIcon className="size-4 text-success" />
          </div>
          <div className="flex items-start gap-3">
            <IconChip icon={CookingPotIcon} tone="shopping" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{tr("Tomato paste")}</p>
              <p className="text-xs text-muted-foreground">
                {tr("1 jar purchased · not in tracked stock yet")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => go("visit-item-adjust")}
              >
                {tr("Choose stock location")}
              </Button>
            </div>
          </div>
          <p className="border-t pt-3 text-xs text-muted-foreground">
            {tr("Not now: yoghurt · stays on the shopping list")}
          </p>
        </Card>
        <Card>
          <CardTitle>{tr("Receipt or expense? Optional.")}</CardTitle>
          <CardDescription>
            {tr(
              "Link the same purchase now or later. Stock is not added again.",
            )}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => go("payment-link")}>
              {tr("Link an expense")}
            </Button>
            <Button variant="outline" onClick={() => go("visit-receipts")}>
              {tr("Add a receipt")}
            </Button>
          </div>
        </Card>
      </>
    );
  if (p.kind === "dashboard")
    content = (
      <>
        {progress(
          tr("Making progress together today"),
          4,
          7,
          tr("Finish tasks, plan and help each other — real progress."),
        )}
        <PageGrid columns="stats">
          <StatTile
            label={tr("Still today")}
            value={tr("3 tasks")}
            icon={ListChecksIcon}
            to={href("tasks")}
          />
          <StatTile
            label={tr("Continue shopping")}
            value={tr("Colruyt group")}
            hint={tr("Shared checklist")}
            icon={ShoppingCartIcon}
            to={href("visit-active")}
          />
          <StatTile
            label={tr("Next project step")}
            value={tr("Bathroom")}
            hint={tr("Materials purchased")}
            icon={FolderKanbanIcon}
            to={href("project-detail")}
          />
        </PageGrid>
        <div onClickCapture={(event) => {
          const target = (event.target as Element).closest("a");
          if (!target) return;
          event.preventDefault(); event.stopPropagation();
          const path = target.getAttribute("href") ?? "";
          go(path.startsWith("/devices/") ? "device-detail" : path.startsWith("/tasks/") ? "task-detail" : path.startsWith("/projects/") ? "project-detail" : path === "/places" ? "places" : "room-live");
        }}>
          <HomeRoomMap data={homeMapFixture} live={false} now={DEVICES_NOW} />
        </div>
        {list}
      </>
    );
  if (p.kind === "task")
    content = (
      <>
        {progress(
          tr("Install the bathroom cabinet"),
          1,
          3,
          tr("Check materials → assemble → review the result"),
        )}
        <Card>
          <CardTitle>{tr("Ready to start")}</CardTitle>
          <CardDescription>
            {tr("Rob and Cindy · bathroom · part of Bathroom renovation")}
          </CardDescription>
          <Button asChild variant="outline">
            <Link to={href("project-materials", p.id)}>
              {tr("View requirements and stock")}
            </Link>
          </Button>
        </Card>
        {list}
      </>
    );
  if (p.kind === "recipe")
    content = (
      <>
        <Card tone="featured">
          <CardTitle>{tr("Pasta with tomato sauce")}</CardTitle>
          <CardDescription>
            {tr("2 servings · 25 minutes · linked products")}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{tr("2 ingredients at home")}</Badge>
            <Badge variant="warning">{tr("1 still to pick up")}</Badge>
          </div>
          <Button onClick={() => go("recipe-check-dialog")}>
            {tr("Check requirements")}
          </Button>
        </Card>
        {list}
      </>
    );
  if (p.kind === "cooking")
    content = (
      <>
        {progress(
          tr("Cooking together"),
          2,
          5,
          tr("Step 3: gently simmer the sauce"),
        )}
        <Card>
          <CardTitle>{tr("Simmer the sauce for 10 minutes")}</CardTitle>
          <CardDescription>
            {tr(
              "Use 1 jar of tomato paste. No weight is needed to count a jar.",
            )}
          </CardDescription>
          <Button onClick={() => go("cook-summary")}>
            {tr("Finish step")}
          </Button>
          <Button variant="outline" onClick={() => go("add-extra-dialog")}>
            {tr("Add an ingredient")}
          </Button>
        </Card>
      </>
    );
  if (["form", "auth", "setup", "consent", "dialog"].includes(p.kind))
    content = (
      <Card>
        <CardTitle>
          {p.kind === "dialog" ? tr("A clear, short action") : p.title}
        </CardTitle>
        {p.kind === "consent" && (
          <p>
            {tr(
              "The AI requests permission to read records and propose changes. Confirmations for real changes still apply.",
            )}
          </p>
        )}
        {p.kind === "dialog" ? (
          <>
            <CardDescription>
              {tr(
                "This form uses GeneralFormDialog with the same EntityPicker selections as elsewhere.",
              )}
            </CardDescription>
            <Button onClick={() => setDialog(true)}>{tr("Open dialog")}</Button>
          </>
        ) : (
          form
        )}
      </Card>
    );
  if (p.kind === "scan")
    content = (
      <>
        <Card tone="featured">
          <div className="grid min-h-48 place-items-center rounded-xl border-2 border-dashed text-section">
            <BoxIcon className="size-16" />
          </div>
          <CardTitle>{tr("Scan a barcode or QR code")}</CardTitle>
          <CardDescription>
            {tr(
              "The camera is not active in this preview. A real scan opens the same product record.",
            )}
          </CardDescription>
          <Button onClick={() => go("inventory-product")}>
            {tr("Open sample product")}
          </Button>
        </Card>
      </>
    );
  if (p.kind === "count")
    content = (
      <>
        {progress(
          tr("Check the garage"),
          2,
          4,
          tr("Count in your own units and review differences before saving."),
        )}
        <Card>
          <GeneralForm
            fields={[
              {
                name: "count",
                label: tr("White mounting adhesive · 3 cartridges expected"),
                type: "number",
                min: 0,
                step: 1,
              },
            ]}
            submitLabel={tr("Review the difference")}
            onSuccess={() => setSaved(true)}
          />
        </Card>
        {list}
      </>
    );
  if (p.kind === "calendar")
    content = (
      <Card>
        <div className="flex justify-between">
          <CardTitle>{tr("Week of 2–8 November")}</CardTitle>
          <Badge variant="secondary">Week</Badge>
        </div>
        <div className="calendar-grid">
          {[
            tr("Mon"),
            tr("Tue"),
            tr("Wed"),
            tr("Thu"),
            tr("Fri"),
            tr("Sat"),
            tr("Sun"),
          ].map((d, i) => (
            <div key={d} className="min-w-0 rounded-xl border p-2">
              <strong className="text-xs">{d}</strong>
              {[1, 3, 5].includes(i) && (
                <Link
                  className="mt-4 block rounded-lg bg-section-soft p-2 text-xs"
                  to={href(i === 5 ? "task-detail" : "calendar-event", p.id)}
                >
                  {i === 5
                    ? tr("Install the cabinet")
                    : i === 3
                      ? tr("Put waste out")
                      : tr("Installer")}
                </Link>
              )}
            </div>
          ))}
        </div>
        <CardDescription>
          {tr(
            "The calendar shows source records; changes are handled by the owner of the appointment, task or payment.",
          )}
        </CardDescription>
      </Card>
    );
  if (p.kind === "map")
    content = (
      <Card>
        <CardTitle>{tr("Ground floor")}</CardTitle>
        <div className="grid min-h-64 grid-cols-2 gap-3 rounded-xl border-2 p-4">
          {["Garage", tr("Kitchen"), tr("Bathroom"), tr("Living room")].map(
            (x) => (
              <Button
                key={x}
                variant="secondary"
                className="h-auto min-h-24 whitespace-normal"
                onClick={() => go("place-detail")}
              >
                {x}
                <MapPinIcon />
              </Button>
            ),
          )}
        </div>
        <CardDescription>
          {tr(
            "The floor plan keeps its own workspace; room information and related content use the same record structure.",
          )}
        </CardDescription>
      </Card>
    );
  if (p.kind === "energy")
    content = (
      <>
        <PageGrid columns="stats">
          <StatTile label={tr("Electricity today")} value="12,4 kWh" />
          <StatTile label={tr("Gas today")} value="4,2 m³" />
          <StatTile
            label={tr("Estimated cost")}
            value={tr("Based on the tariff")}
            hint={tr("Not a recorded expense")}
          />
        </PageGrid>
        <Card>
          <CardTitle>{tr("Daily pattern")}</CardTitle>
          <div
            className="flex h-40 items-end gap-2"
            aria-label={tr("Schematic energy chart")}
          >
            {[20, 28, 42, 25, 67, 83, 54, 46, 31, 65, 27, 16].map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-section/60"
                style={{ height: v + "%" }}
              />
            ))}
          </div>
          <CardDescription>
            {tr(
              "Measurements explain consumption. Actual expenses remain in Expenses.",
            )}
          </CardDescription>
        </Card>
        {list}
      </>
    );
  if (p.kind === "import")
    content = (
      <Card>
        <CardTitle>{tr("Choose file → review → process")}</CardTitle>
        <div className="grid min-h-40 place-items-center rounded-xl border-2 border-dashed">
          <Button onClick={() => setSaved(true)}>
            {tr("Choose sample file")}
          </Button>
        </div>
        <p>
          {tr(
            "The preview shows detected data and possible duplicates before confirmation.",
          )}
        </p>
      </Card>
    );
  if (p.kind === "chat")
    content = (
      <>
        <Card>
          <CardTitle>{tr("Conversation about the bathroom")}</CardTitle>
          <p className="rounded-xl bg-muted p-3">
            {tr("What do I need for the bathroom?")}
          </p>
          <p>
            {tr(
              "The task needs 2 cartridges of adhesive and 1 box of screws. There are 3 cartridges in the garage.",
            )}
          </p>
          <Button asChild variant="outline">
            <Link to={href("project-materials", p.id)}>
              {tr("Open linked requirements")}
            </Link>
          </Button>
        </Card>
        <Card>
          <GeneralForm
            fields={[
              { name: "message", label: tr("Your message"), type: "text" },
            ]}
            submitLabel={tr("Send")}
            onSuccess={() => setSaved(true)}
          />
        </Card>
      </>
    );
  if (p.kind === "house" || p.kind === "live" || p.id === "home-assistant") {
    const unavailable = state === "offline" || state === "stale";
    content = (
      <>
        <Card tone={unavailable ? "warning" : "featured"}>
          <div className="flex items-center gap-3">
            <IconChip
              icon={HouseIcon}
              tone="home"
              className="size-14 rounded-2xl [&_svg]:size-8"
            />
            <div>
              <CardTitle>
                {unavailable
                  ? tr("Home status needs attention")
                  : tr("Your home at a glance")}
              </CardTitle>
              <CardDescription>
                {state === "offline"
                  ? tr(
                      "Home Assistant is unreachable. Current values are not assumed.",
                    )
                  : state === "stale"
                    ? tr(
                        "Last measurement 2 hours ago. Controls require a current connection.",
                      )
                    : tr("Home Assistant connected · updated 15 seconds ago")}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={unavailable ? "warning" : "success"}>
              {unavailable ? tr("Not current") : tr("Connected live")}
            </Badge>
            <Badge variant="secondary">{tr("Source: Home Assistant")}</Badge>
          </div>
        </Card>
        <PageGrid columns="stats">
          <StatTile
            label={tr("Inside")}
            value={unavailable ? tr("Unknown") : "20,5 °C"}
            icon={ThermometerIcon}
            iconTone="warning"
            hint={tr("Living room · source measurement")}
          />
          <StatTile
            label={tr("Lighting")}
            value={unavailable ? tr("Unknown") : tr("3 lights on")}
            icon={LightbulbIcon}
            iconTone="highlight"
          />
          <StatTile
            label="Alarm"
            value={unavailable ? tr("Unknown") : tr("Armed")}
            icon={ShieldCheckIcon}
            iconTone="home"
            hint={tr("Secure controls remain separate")}
          />
          <StatTile
            label={tr("Outside")}
            value="12 °C"
            icon={CloudSunIcon}
            iconTone="calendar"
            hint={tr("Different source: weather provider")}
          />
        </PageGrid>
        <PageGrid columns="cards">
          {[
            [
              tr("Living room"),
              tr("Lighting and climate"),
              "room-live",
              LightbulbIcon,
              "highlight",
            ],
            [
              tr("Devices"),
              tr("Controls based on capabilities"),
              "devices",
              WashingMachineIcon,
              "devices",
            ],
            [
              tr("Energy"),
              tr("Measurements, solar and battery"),
              "energy-live",
              SparklesIcon,
              "energy",
            ],
            [
              tr("Residents"),
              tr("Who lives here and does what"),
              "habitants",
              UsersIcon,
              "tasks",
            ],
            [
              tr("Home modes"),
              tr("For example: evening or away"),
              "ha-scenes",
              HouseIcon,
              "home",
            ],
            [
              tr("Contacts"),
              tr("Professionals and suppliers"),
              "contacts",
              UsersIcon,
              "documents",
            ],
            [
              tr("Waste"),
              tr("Collection schedule and tasks"),
              "waste",
              BoxIcon,
              "shopping",
            ],
            [
              tr("Weather"),
              tr("Planning in and around the home"),
              "weather",
              CloudSunIcon,
              "calendar",
            ],
          ].map(([title, desc, id, icon, tone]) => (
            <Card key={title as string}>
              <IconChip
                icon={icon as typeof HouseIcon}
                tone={tone as SectionAccent}
              />
              <CardTitle>{title as string}</CardTitle>
              <CardDescription>{desc as string}</CardDescription>
              <Button asChild variant="outline">
                <Link to={href(id as string, p.id)}>
                  {tr("Open")}
                  <ChevronRightIcon />
                </Link>
              </Button>
            </Card>
          ))}
        </PageGrid>
        <Card>
          <CardTitle>{tr("Familiar controls")}</CardTitle>
          <CardDescription>
            {tr(
              "Only supported capabilities are controllable. These buttons affect the design preview only.",
            )}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={unavailable}
              onClick={() => setSaved(true)}
            >
              <LightbulbIcon /> {tr("Toggle lamp")}
            </Button>
            <Button
              variant="outline"
              disabled={unavailable}
              onClick={() => go("ha-scenes")}
            >
              {tr("Choose a home mode")}
            </Button>
            <Button variant="ghost" onClick={() => go("ha-map")}>
              {tr("Link sources and devices")}
            </Button>
          </div>
        </Card>
      </>
    );
  }
  if (p.kind === "live" || p.id === "home-assistant")
    content = (
      <HomePanels
        id={p.id}
        state={state}
        href={(id) => href(id, p.id)}
        onAction={() => setSaved(true)}
      />
    );
  if (
    p.kind === "settings" ||
    (p.kind === "connections" && p.id !== "home-assistant")
  )
    content = (
      <PageGrid columns="cards">
        {p.rows.map((r, i) => (
          <Card key={r.label} tone={i === 0 ? "featured" : "default"}>
            <Icon className="size-7 text-section" />
            <CardTitle>{r.label}</CardTitle>
            <CardDescription>{r.meta}</CardDescription>
            <Button asChild variant="outline">
              <Link to={listLink(p, r)}>
                {tr("Open")}
                <ChevronRightIcon />
              </Link>
            </Button>
          </Card>
        ))}
      </PageGrid>
    );
  if (p.kind === "redirect" || p.kind === "empty")
    content = (
      <EmptyState
        icon={Icon}
        title={p.title}
        description={p.goal}
        action={<Button onClick={onPrimary}>{p.primary}</Button>}
      />
    );
  if (p.kind === "search")
    content = (
      <Card>
        <EntityPicker
          items={pages.map((x) => ({
            id: x.id,
            label: x.title,
            description: label[x.owner],
          }))}
          onChange={(x) => {
            if (x) go(x);
          }}
          placeholder={tr("Search product, project, purchase, task…")}
        />
        <CardDescription>
          {tr("Search by a familiar name and open the record with its owner.")}
        </CardDescription>
      </Card>
    );
  if (state === "loading")
    content = (
      <Card>
        <SkeletonList rows={4} />
        <p role="status">{tr("Loading records…")}</p>
      </Card>
    );
  if (state === "empty")
    content = (
      <EmptyState
        icon={Icon}
        title={tr("Nothing here yet")}
        description={tr(
          "Add something or link an existing record. Missing amounts or quantities are not invented.",
        )}
        action={<Button onClick={onPrimary}>{p.primary}</Button>}
      />
    );
  if (state === "error")
    content = (
      <ErrorState
        title={tr("This area could not load")}
        description={tr("Your records are preserved. Try again or go back.")}
        action={
          <Button onClick={() => window.location.assign(href(p.id))}>
            {tr("Try again")}
          </Button>
        }
      />
    );
  if (state === "denied")
    content = (
      <EmptyState
        icon={CircleHelpIcon}
        title={tr("You do not have access to these records")}
        description={tr(
          "The owner controls access. Restricted financial totals and relationships are not displayed.",
        )}
      />
    );
  const heading = (
    <>
      <PageHeader
        title={p.title}
        icon={Icon}
        description={p.goal}
        actions={
          [
            "visit-start",
            "visit",
            "visit-summary",
            "dialog",
            "auth",
            "consent",
            "form",
            "setup",
            "project",
            "recipe",
            "cooking",
            "count",
            "scan",
            "import",
            "settings",
            "live",
          ].includes(p.kind) || state === "empty" ? undefined : (
            <Button onClick={onPrimary}>{p.primary}</Button>
          )
        }
      />
      {params.get("from") && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-section-soft px-3 py-2 text-sm">
          <span>
            {tr("Opened from")}{" "}
            {byId.get(params.get("from")!)?.title || tr("a linked record")}
          </span>
          <Button variant="ghost" size="sm" asChild>
            <Link to={href(params.get("from")!)}>{tr("Back to context")}</Link>
          </Button>
        </div>
      )}
      {areas.length > 0 && (
        <nav
          aria-label={tr("Sections")}
          className="flex flex-wrap gap-1 border-b pb-2"
        >
          {areas.map(([id, title]) => (
            <Button
              key={id}
              variant={p.id === id ? "secondary" : "ghost"}
              asChild
            >
              <Link to={href(id!)}>{title}</Link>
            </Button>
          ))}
        </nav>
      )}
      {relationNav && state !== "denied" && relations.length > 0 && (
        <RelatedRecordCards
          label={tr("Related records")}
          items={relations.map((r) => {
            // The catalogue contains authored copy; production supplies typed labels and summaries separately.
            const [label, ...summary] = r.label.split(" · ");
            const kind = relatedKinds[r.to];
            const owner = byId.get(r.to)?.owner || "home";
            return {
              id: r.to,
              label: label!,
              ...(summary.length ? { value: summary.join(" · ") } : {}),
              icon: kind?.icon || icons[owner] || ArrowRightIcon,
              accent: kind?.accent || accent(owner),
              current: r.to === p.id,
              to:
                r.to === p.id
                  ? window.location.pathname + window.location.search
                  : href(r.to, p.id),
            };
          })}
        />
      )}
    </>
  );
  const body = (
    <PageContainer className="gap-5">
      {(record || tripWorkspace) && state !== "denied" && (
        <BreadcrumbTrail
          items={
            tripWorkspace
              ? [
                  { label: tr("Shopping"), to: href("shopping") },
                  {
                    label: tr("Shopping trips"),
                    to: href("shopping-sessions"),
                  },
                  { label: p.title },
                ]
              : [
                  { label: label[p.owner] ?? p.owner, to: href(baseId) },
                  { label: p.title },
                ]
          }
          label={tr("You are here")}
        />
      )}
      {p.coverKey && state === "normal" && (
        <RecordPhoto
          mediaKey={p.coverKey}
          alt={p.title}
          shape="banner"
          icon={Icon}
        />
      )}
      {state === "denied" ? (
        <PageHeader
          title={tr("No access")}
          description={tr("These records are not available with your access.")}
        />
      ) : (
        heading
      )}
      {saved && (
        <Card tone="success">
          <p role="status">
            {tr("Saved in this design preview. No real records were changed.")}
          </p>
        </Card>
      )}
      {state === "conflict" && (
        <Card tone="warning">
          <CardTitle>{tr("This has changed since you opened it")}</CardTitle>
          <CardDescription>
            {tr(
              "Your input is preserved. Review the current state before confirming again.",
            )}
          </CardDescription>
          <Button
            variant="outline"
            onClick={() => window.location.assign(href(p.id))}
          >
            {tr("Review current state")}
          </Button>
        </Card>
      )}
      {content}
      {dialog && (
        <GeneralFormDialog
          title={p.kind === "dialog" ? p.title : p.primary}
          description={p.goal}
          fields={fields}
          open={dialog}
          onOpenChange={setDialog}
          submitLabel={p.primary}
          onSuccess={() => setSaved(true)}
        />
      )}
      <p className="pb-5 text-xs text-muted-foreground">
        {tr("Design preview · fictional data ·")} {label[p.owner]} ·{" "}
        {p.currentRoute ? tr("existing route") : tr("proposed view or dialog")}
      </p>
    </PageContainer>
  );
  if (["auth", "consent"].includes(p.kind))
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <BrandMark />
        {body}
      </main>
    );
  return (
    <AppShell
      brand={<BrandMark />}
      navigation={nav}
      account={
        <Button asChild variant="ghost">
          <Link
            to={href("settings-account")}
            aria-label={tr("Rob · my account")}
          >
            <span className="hidden lg:inline">{tr("Rob · my account")}</span>
            <Avatar className="size-7 lg:hidden">
              <AvatarFallback>R</AvatarFallback>
            </Avatar>
          </Link>
        </Button>
      }
      menuLabel={tr("Navigation")}
      accent={accent(p.owner)}
      quickActions={{
        sidebar: (
          <Button className="w-full" asChild>
            <Link to={href("global-search")}>
              <SearchIcon />
              {tr("Search or quick action")}
            </Link>
          </Button>
        ),
        topBar: (
          <Button size="icon" variant="ghost" asChild aria-label={tr("Search")}>
            <Link to={href("global-search")}>
              <SearchIcon />
            </Link>
          </Button>
        ),
      }}
    >
      {body}
      <nav
        aria-label={tr("Daily navigation")}
        className="sticky bottom-0 z-20 flex items-center justify-around border-t bg-card p-2 lg:hidden"
      >
        {[
          ["dashboard", tr("Today"), HouseIcon],
          ["tasks", tr("Tasks"), ListChecksIcon],
          ["shopping", tr("Shopping"), ShoppingCartIcon],
          ["house", tr("Home"), HouseIcon],
          ["global-search", tr("More"), LayersIcon],
        ].map(([id, text, ItemIcon]) => {
          const MobileIcon = ItemIcon as typeof HouseIcon;
          return (
            <Button
              key={id as string}
              variant="ghost"
              size="sm"
              className="h-auto flex-col gap-1 px-2 py-2"
              asChild
            >
              <Link to={navHref(id as string)}>
                <MobileIcon className="size-5" />
                <span className="text-[10px]">{text as string}</span>
              </Link>
            </Button>
          );
        })}
      </nav>
    </AppShell>
  );
}
localStorage.setItem(
  "wh-locale",
  new URLSearchParams(location.search).get("lang") === "nl" ? "nl" : "en",
);
await initI18n();
const router = createBrowserRouter([
  { path: "*", element: <View />, action: async ({ request }) => {
    const data = await request.formData();
    if (data.get("intent") === "adjust-item") window.dispatchEvent(new CustomEvent("wickedhome-design-adjusted", { detail: { itemId: data.get("itemId"), quantity: Number(data.get("quantity")), productId: data.get("productId") } }));
    return { ok: true };
  } },
]);
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
