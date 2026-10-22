import * as React from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppProviders } from "../src/app/app-providers";
import { initI18n, setLocale } from "../src/lib/i18n";
import { SECTION_ACCENTS } from "../src/lib/section-accent";
import type { Locale } from "../src/types/common";
import "../src/styles/index.css";

void initI18n();

type StoryComponent = Parameters<Decorator>[0];
type RouterParameters = { initialEntries?: string[]; action?: () => Promise<unknown> };

/** Applies the toolbar's language, theme and section accent (docs/BRANDING.md). */
function LocaleAndTheme({ locale, theme, accent, children }: { locale: Locale; theme: string; accent: string; children: React.ReactNode }) {
  React.useEffect(() => void setLocale(locale), [locale]);
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  React.useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  return children;
}

/**
 * Components use links, forms and fetchers, so every story runs inside a data router. Form submissions
 * succeed with `{ ok: true }`; override with `parameters.router.action`.
 */
function StoryRouter({ story: Story, parameters = {} }: { story: StoryComponent; parameters?: RouterParameters }) {
  const [router] = React.useState(() =>
    createMemoryRouter(
      [{ path: "*", Component: () => <Story />, action: parameters.action ?? (async () => ({ ok: true })) }],
      { initialEntries: parameters.initialEntries ?? ["/"] },
    ),
  );
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

const withLocaleAndTheme: Decorator = (Story, context) => (
  <LocaleAndTheme
    locale={context.globals.locale as Locale}
    theme={context.globals.theme as string}
    accent={(context.globals.accent as string | undefined) ?? "home"}
  >
    <Story />
  </LocaleAndTheme>
);

// Keyed by story id: each story gets a fresh router.
const withRouter: Decorator = (Story, context) => (
  <StoryRouter key={context.id} story={Story} parameters={context.parameters.router as RouterParameters} />
);

const preview: Preview = {
  decorators: [withRouter, withLocaleAndTheme],
  globalTypes: {
    locale: {
      description: "Language",
      toolbar: {
        title: "Language",
        icon: "globe",
        items: [
          { value: "en", title: "English" },
          { value: "nl", title: "Nederlands" },
        ],
        dynamicTitle: true,
      },
    },
    theme: {
      description: "Theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
    accent: {
      description: "Section accent (the page's colour)",
      toolbar: {
        title: "Accent",
        icon: "paintbrush",
        items: SECTION_ACCENTS.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: "en", theme: "light", accent: "home" },
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i } },
    options: {
      storySort: {
        order: ["Introduction", "Foundations", "UI", "Shared", "Layout", "Features", ["*", ["Components", "Screens"]]],
      },
    },
  },
};

export default preview;
