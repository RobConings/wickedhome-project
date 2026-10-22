import { createBrowserRouter } from "react-router";
import { SESSION_ROUTE_ID } from "@/features/auth";
import * as root from "@/routes/root";

/**
 * URL → route file. Route files are loaded lazily, so each page is its own chunk.
 * Everything under the session route requires a login.
 */
export const router = createBrowserRouter([
  {
    id: "root",
    path: "/",
    Component: root.Component,
    ErrorBoundary: root.ErrorBoundary,
    HydrateFallback: root.HydrateFallback,
    children: [
      { path: "login", lazy: () => import("@/routes/login") },
      { path: "setup", lazy: () => import("@/routes/setup") },
      { path: "logout", lazy: () => import("@/routes/logout") },
      // Invite and password-reset links (docs/ACCOUNTS.md): public, one page for both.
      { path: "invite/:token", lazy: () => import("@/routes/link") },
      { path: "reset/:token", lazy: () => import("@/routes/link") },
      // OAuth consent for MCP clients (ChatGPT, Claude…; ai/docs/MCP-OAUTH.md): signed in, but without the app frame.
      { path: "connect/:requestId", lazy: () => import("@/routes/connect") },
      {
        id: SESSION_ROUTE_ID,
        lazy: () => import("@/routes/session-layout"),
        children: [
          { index: true, lazy: () => import("@/routes/dashboard") },
          { path: "house", lazy: () => import("@/routes/house") },
          { path: "habitants", lazy: () => import("@/routes/habitants") },
          { path: "contacts", lazy: () => import("@/routes/contacts") },
          { path: "places", lazy: () => import("@/routes/places") },
          { path: "places/floors/:floorId/plan", lazy: () => import("@/routes/floor-plan") },
          { path: "places/:placeId", lazy: () => import("@/routes/place-detail") },
          { path: "tasks", lazy: () => import("@/routes/tasks") },
          { path: "tasks/:taskId", lazy: () => import("@/routes/task-detail") },
          { path: "shops", lazy: () => import("@/routes/shops") },
          { path: "shops/:shopId", lazy: () => import("@/routes/shop-detail") },
          { path: "shopping", lazy: () => import("@/routes/shopping") },
          { path: "shopping/shops", lazy: () => import("@/routes/shopping-shop-view") },
          { path: "shopping/shops/:shopId", lazy: () => import("@/routes/shopping-shop-view") },
          { path: "shopping/products", lazy: () => import("@/routes/shopping-products") },
          { path: "inventory", lazy: () => import("@/routes/inventory") },
          { path: "inventory/scan", lazy: () => import("@/routes/inventory-scan") },
          { path: "inventory/products/:productId", lazy: () => import("@/routes/inventory-product") },
          // Recipes (docs/RECIPES.md): "To cook" + all recipes, one recipe, the cooking view of a meal.
          { path: "recipes", lazy: () => import("@/routes/recipes") },
          { path: "recipes/cook/:entryId", lazy: () => import("@/routes/recipe-cooking") },
          { path: "recipes/:recipeId", lazy: () => import("@/routes/recipe-detail") },
          { path: "expenses", lazy: () => import("@/routes/expenses") },
          { path: "expenses/recurring/:recurringId", lazy: () => import("@/routes/recurring-expense-detail") },
          { path: "expenses/:expenseId", lazy: () => import("@/routes/expense-detail") },
          // Finance phase 2: incomes and the money flow (joint accounts).
          { path: "income", lazy: () => import("@/routes/income") },
          { path: "money", lazy: () => import("@/routes/money") },
          // Finance phase 3: projects (budget pots).
          { path: "projects", lazy: () => import("@/routes/projects") },
          { path: "projects/:projectId", lazy: () => import("@/routes/project-detail") },
          // Old Bills and Subscriptions pages redirect to the expenses.
          { path: "bills", lazy: () => import("@/routes/bills") },
          { path: "bills/:billId", lazy: () => import("@/routes/bills") },
          { path: "subscriptions", lazy: () => import("@/routes/subscriptions") },
          { path: "subscriptions/:subscriptionId", lazy: () => import("@/routes/subscriptions") },
          { path: "documents", lazy: () => import("@/routes/documents") },
          { path: "documents/folders/:folderId", lazy: () => import("@/routes/documents") },
          { path: "documents/trash", lazy: () => import("@/routes/documents-trash") },
          { path: "calendar", lazy: () => import("@/routes/calendar") },
          { path: "calendar/events/:eventId", lazy: () => import("@/routes/calendar-event") },
          { path: "energy", lazy: () => import("@/routes/energy") },
          { path: "energy/appliances", lazy: () => import("@/routes/energy-appliances") },
          { path: "energy/setup", lazy: () => import("@/routes/energy-setup") },
          { path: "energy/import", lazy: () => import("@/routes/energy-import") },
          { path: "devices", lazy: () => import("@/routes/devices") },
          { path: "devices/profiles", lazy: () => import("@/routes/device-profiles") },
          { path: "devices/profiles/:profileId", lazy: () => import("@/routes/device-profile") },
          { path: "devices/:deviceId", lazy: () => import("@/routes/device-detail") },
          // Home Assistant (docs/INTEGRATIONS.md): connection, device import, energy statistics, alarm log.
          { path: "home-assistant", lazy: () => import("@/routes/home-assistant") },
          // The assistant (ai/docs/ASSISTANT.md): a new chat, or one conversation.
          { path: "assistant", lazy: () => import("@/routes/assistant") },
          { path: "assistant/:conversationId", lazy: () => import("@/routes/assistant") },
          { path: "settings", lazy: () => import("@/routes/settings") },
          // Integrations (docs/INTEGRATIONS.md): one card per integration; Drive folders linked into Documents.
          { path: "integrations", lazy: () => import("@/routes/integrations") },
          { path: "documents/drive/:linkId", lazy: () => import("@/routes/documents-drive") },
          // Notifications (docs/NOTIFICATIONS.md): the person's notification center; settings live in Settings.
          { path: "notifications", lazy: () => import("@/routes/notifications") },
          { path: "*", lazy: () => import("@/routes/not-found") },
        ],
      },
    ],
  },
]);
