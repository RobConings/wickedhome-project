import type { StorybookConfig } from "@storybook/react-vite";

// Storybook picks up vite.config.ts, so the `@/` alias and Tailwind work exactly as in the app.
const config: StorybookConfig = {
  stories: ["./docs/*.mdx", "../stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
};

export default config;
