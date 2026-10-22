import type { AppShellNavSection } from "./components/app-shell";
import type { SectionAccent } from "./lib/section-accent";

/**
 * Which section accent (colour) each part of the app uses: the first URL segment → accent. The frame
 * puts it on the page (`data-accent`) and on the navigation items, so shared components (page header,
 * stat tiles, icon chips, tabs, progress bars…) pick the colour up without the feature knowing it.
 * A new feature adds its first path segment here (and its nav item gets the same colour automatically).
 */
const ACCENT_BY_SEGMENT: Record<string, SectionAccent> = {
  "": "home",
  house: "home",
  habitants: "home",
  contacts: "home",
  places: "home",
  tasks: "tasks",
  shopping: "shopping",
  shops: "shopping",
  inventory: "shopping",
  recipes: "shopping",
  calendar: "calendar",
  energy: "energy",
  documents: "documents",
  expenses: "finance",
  income: "finance",
  money: "finance",
  projects: "finance",
  bills: "finance",
  subscriptions: "finance",
  assistant: "assistant",
  "home-assistant": "devices",
  devices: "devices",
  integrations: "integrations",
  notifications: "integrations",
  settings: "integrations",
};

/** The accent for a pathname ("/expenses/123" → "finance"); unknown paths use the brand's home green. */
export function accentForPath(pathname: string): SectionAccent {
  const segment = pathname.split("/")[1] ?? "";
  return ACCENT_BY_SEGMENT[segment] ?? "home";
}

/**
 * Gives every nav item the accent of its link (unless set), and a titled group (e.g. Finance) the accent
 * its items share, so the sidebar shows the same colours as the pages.
 */
export function withNavAccents(sections: AppShellNavSection[]): AppShellNavSection[] {
  return sections.map((section) => {
    const items = section.items.map((item) => ({ ...item, accent: item.accent ?? accentForPath(item.to) }));
    const first = items[0]?.accent;
    const shared = first && items.every((item) => item.accent === first) ? first : undefined;
    return { ...section, accent: section.accent ?? (section.label ? shared : undefined), items };
  });
}
