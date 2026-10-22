import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import storybook from "eslint-plugin-storybook";
import globals from "globals";
import tseslint from "typescript-eslint";

/*
 * Layer rules. The architecture is enforced here, not in a wiki: importing across a layer boundary is a
 * lint error with a message that explains why. See docs/ARCHITECTURE.md.
 *
 * Each block applies to one folder and lists everything that folder may NOT import. Later blocks
 * override earlier ones for the files they match, so every block repeats the full list for its folder.
 */
const forbid = (group, message) => ({ group, message });
const forbidRegex = (regex, message) => ({ regex, message });

const NO_API = forbid(["@/api", "@/api/**"], "Browser code must not import server code from src/api.");
const NO_APP = forbid(["@/app", "@/app/**"], "src/app is the composition root; nothing below it may import it.");
const NO_ROUTES = forbid(["@/routes", "@/routes/**"], "Route files are entry points; nothing imports them.");
const NO_FEATURES = forbid(["@/features", "@/features/**"], "This layer must stay domain-agnostic.");
const NO_SHARED = forbid(["@/components/shared", "@/components/shared/**"], "Lower layers must not use shared components.");
const NO_LAYOUT = forbid(["@/components/layout", "@/components/layout/**"], "Primitives must not depend on layout components.");
const NO_COMPONENTS = forbid(["@/components", "@/components/**"], "This code must not render UI components.");
const NO_LIB = forbid(["@/lib", "@/lib/**"], "src/lib is browser infrastructure.");
const NO_FEATURE_INTERNALS = forbidRegex(
  "^@/features/[^/]+/",
  "Import another feature through its public index (`@/features/<name>`), never its internals.",
);
const NO_LEAVING_FOLDER = forbidRegex("^\\.\\./", "Use the `@/` alias to import from another folder.");
const NO_LEAVING_FEATURE = forbidRegex(
  "^(\\.\\./){2,}",
  "A feature imports its own files relatively and everything else through `@/`.",
);

const NO_AI = forbid(["@ai", "@ai/**"], "Features never import the assistant (ai/): skills register themselves from ai/skills.");
const NO_AI_RELATIVE = forbidRegex("^(\\.\\./)+ai/", "Features never import the assistant (ai/).");

const layer = (files, patterns, paths = []) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns, paths }] },
});

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/api/generated", "storybook-static"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  {
    files: ["src/**/*.tsx", "stories/**/*.tsx", ".storybook/**/*.tsx"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: ["loader", "action", "Component", "ErrorBoundary", "HydrateFallback"],
        },
      ],
    },
  },
  ...storybook.configs["flat/recommended"],
  { files: [".storybook/**"], rules: { "react-refresh/only-export-components": "off" } },

  // 1. Primitives: only other primitives and lib/utils.
  layer(["src/components/ui/**"], [NO_API, NO_APP, NO_ROUTES, NO_FEATURES, NO_SHARED, NO_LAYOUT, NO_LEAVING_FOLDER]),
  // shadcn files export variant helpers next to components.
  { files: ["src/components/ui/**"], rules: { "react-refresh/only-export-components": "off" } },

  // 2. Shared compositions: primitives, layout and other shared components. Never domain code.
  layer(["src/components/shared/**"], [NO_API, NO_APP, NO_ROUTES, NO_FEATURES, NO_LEAVING_FOLDER]),

  // 3. Layout: structure only. Primitives yes, shared compositions and domain code no.
  layer(["src/components/layout/**"], [NO_API, NO_APP, NO_ROUTES, NO_FEATURES, NO_SHARED, NO_LEAVING_FOLDER]),

  // 4 + 5. Features (components and screens): any component layer, other features only via their index.
  layer(["src/features/**"], [NO_API, NO_APP, NO_ROUTES, NO_FEATURE_INTERNALS, NO_LEAVING_FEATURE, NO_AI, NO_AI_RELATIVE]),

  // Feature contracts are shared with src/api, so they must run in the browser AND in Node.
  layer(
    ["src/features/*/types/**"],
    [NO_API, NO_APP, NO_ROUTES, NO_COMPONENTS, NO_LIB, NO_FEATURE_INTERNALS, NO_LEAVING_FEATURE, NO_AI, NO_AI_RELATIVE],
    [{ name: "react", message: "Feature types are shared with the API and must not use React." }],
  ),

  // Route files: connect a feature's loader/action to its screen. No direct UI.
  layer(["src/routes/**"], [NO_API, NO_COMPONENTS, NO_FEATURE_INTERNALS, NO_LEAVING_FOLDER]),

  // Composition root: may use every layer, features only via their index.
  layer(["src/app/**"], [NO_API, NO_FEATURE_INTERNALS, NO_LEAVING_FOLDER]),

  // Browser infrastructure: data access (api-client, loaders, forms), formatting, storage, permissions.
  layer(["src/lib/**"], [NO_API, NO_APP, NO_ROUTES, NO_FEATURES, NO_COMPONENTS, NO_LEAVING_FOLDER]),
  // Shared hooks (src/lib/hooks): behaviour without markup (fetcher results, panel data, clocks, media
  // queries, clipboard). Same rules as lib: domain-agnostic and no components, so every layer above may use them.
  layer(["src/lib/hooks/**"], [NO_API, NO_APP, NO_ROUTES, NO_FEATURES, NO_COMPONENTS, NO_LEAVING_FOLDER]),

  // App-wide types: pure TypeScript and zod.
  layer(["src/types/**"], [NO_API, NO_APP, NO_ROUTES, NO_FEATURES, NO_COMPONENTS, NO_LIB, NO_LEAVING_FOLDER]),

  // Server: Node only. Shares feature contracts (`@/features/<name>/types/...`) and nothing else from the browser.
  // The assistant (ai/) is mounted by app.ts and server.ts only; the features' API never imports it.
  ...[
    [["src/api/**"], [NO_AI, NO_AI_RELATIVE]],
    [["src/api/app.ts", "src/api/server.ts"], []],
  ].map(([files, extra]) =>
    layer(
      files,
      [
        NO_APP,
        NO_ROUTES,
        NO_COMPONENTS,
        NO_LIB,
        forbidRegex("^@/features/[^/]+$", "The API may only import feature contracts: `@/features/<name>/types/...`."),
        forbidRegex("^@/features/[^/]+/(?!types/)", "The API may only import feature contracts: `@/features/<name>/types/...`."),
        ...extra,
      ],
      [
        { name: "react", message: "src/api runs in Node." },
        { name: "react-dom", message: "src/api runs in Node." },
        { name: "react-router", message: "src/api runs in Node." },
      ],
    ),
  ),

  // The assistant (ai/): Node only, like src/api. May use the features' API services and contracts.
  layer(
    ["ai/**"],
    [
      NO_APP,
      NO_ROUTES,
      NO_COMPONENTS,
      NO_LIB,
      forbidRegex("^@/features/[^/]+$", "ai/ may only import feature contracts: `@/features/<name>/types/...`."),
      forbidRegex("^@/features/[^/]+/(?!types/)", "ai/ may only import feature contracts: `@/features/<name>/types/...`."),
      forbidRegex("^\\.\\./\\.\\./src/", "Use the `@/` alias to import from src/."),
    ],
    [
      { name: "react", message: "ai/ runs in Node." },
      { name: "react-dom", message: "ai/ runs in Node." },
      { name: "react-router", message: "ai/ runs in Node." },
    ],
  ),
);
