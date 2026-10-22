import express from "express";
// The assistant lives in ai/ (ai/README.md): its core (chat, MCP) and every skill, registered here once.
import { assistantRouter } from "@ai/core/assistant.routes";
import { mcpRouter } from "@ai/core/mcp.routes";
import { mcpOAuthRouter, mcpWellKnownRouter } from "@ai/core/mcp-oauth.routes";
import "@ai/skills";
import { auditRouter } from "./audit/audit.routes";
import { authRouter } from "./auth/auth.routes";
import { calendarRouter } from "./calendar/calendar.routes";
import { contactsRouter } from "./contacts/contacts.routes";
import { devicesRouter } from "./devices/devices.routes";
import { documentsRouter, documentsUploadRouter } from "./documents/documents.routes";
import { energyRouter } from "./energy/energy.routes";
import { expensesRouter } from "./expenses/expenses.routes";
import { homeAssistantRouter } from "./home-assistant/home-assistant.routes";
import { householdRouter } from "./household/household.routes";
import { incomeRouter } from "./income/income.routes";
import { integrationsRouter } from "./integrations/integrations.routes";
import { inventoryRouter } from "./inventory/inventory.routes";
import { jobsRouter } from "./jobs/jobs.routes";
import { eventsRouter } from "./lib/events";
import { errorHandler, notFoundHandler, requireAppHeader } from "./lib/http";
import { loadSession } from "./lib/session";
import { mailRouter } from "./mail/mail.routes";
import { moneyRouter } from "./money/money.routes";
import { notificationsRouter } from "./notifications/notifications.routes";
import { placesRouter } from "./places/places.routes";
import { projectsRouter } from "./projects/projects.routes";
import { recipesRouter } from "./recipes/recipes.routes";
import { selectionsRouter } from "./selections/selections.routes";
import { shoppingRouter } from "./shopping/shopping.routes";
import { shopsRouter } from "./shops/shops.routes";
import { tasksRouter } from "./tasks/tasks.routes";
import { wasteRouter } from "./waste/waste.routes";
import { weatherRouter } from "./weather/weather.routes";

export function createApp() {
  const app = express();

  // nginx on the same machine sets X-Forwarded-For; trust it for req.ip (rate limiting).
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");

  // OAuth 2.1 for the MCP server (ai/docs/MCP-OAUTH.md): discovery and the OAuth endpoints live at the site
  // root, as the RFCs expect, before the SPA fallback. No session and no CSRF header: OAuth clients send neither.
  app.use("/.well-known", mcpWellKnownRouter);
  app.use("/oauth", mcpOAuthRouter);
  // The consent page (an app page, /connect/<request id>) may never be framed (clickjacking).
  app.use("/connect", (_req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  const api = express.Router();
  // Document uploads (PUT /api/documents/files/:id/content) stream the raw request body to storage. That
  // route must come before express.json(), which would otherwise consume (and 1 MB-limit) the body of a
  // .json file upload; it does its own CSRF header and session checks.
  api.use("/documents", documentsUploadRouter);
  // MCP server for other assistants on the LAN (ai/docs/ASSISTANT.md): bearer-token auth, no cookie, so no
  // CSRF header; it parses its own JSON body.
  api.use("/mcp", mcpRouter);
  api.use(express.json({ limit: "1mb" }));
  api.use(requireAppHeader);
  api.use(loadSession);

  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  // One router per feature folder: src/api/<feature> is served at /api/<feature>.
  api.use("/auth", authRouter);
  api.use("/household", householdRouter);
  api.use("/places", placesRouter);
  api.use("/tasks", tasksRouter);
  api.use("/selections", selectionsRouter);
  api.use("/shops", shopsRouter);
  api.use("/shopping", shoppingRouter);
  api.use("/inventory", inventoryRouter);
  // Finance: bills and subscriptions became expenses (docs/FINANCE.md).
  api.use("/expenses", expensesRouter);
  // Finance phase 2: incomes, and the joint accounts with the money flow.
  api.use("/income", incomeRouter);
  api.use("/money", moneyRouter);
  // Finance phase 3: projects (budget pots) with linked tasks, expenses and materials.
  api.use("/projects", projectsRouter);
  // Contacts: contractors, suppliers, services… linked to projects with a role.
  api.use("/contacts", contactsRouter);
  // Recipes (docs/RECIPES.md): recipes, the "To cook" list and cooking.
  api.use("/recipes", recipesRouter);
  api.use("/calendar", calendarRouter);
  api.use("/energy", energyRouter);
  api.use("/devices", devicesRouter);
  // Home Assistant (docs/INTEGRATIONS.md); the connection itself is started by server.ts.
  api.use("/home-assistant", homeAssistantRouter);
  api.use("/weather", weatherRouter);
  api.use("/waste", wasteRouter);
  // The assistant (ai/docs/ASSISTANT.md): chat, status, speech to text, MCP tokens. Tools come from ai/skills.
  api.use("/assistant", assistantRouter);
  // Scheduled jobs ("Automations" in Settings); the scheduler itself is started by server.ts.
  api.use("/jobs", jobsRouter);
  // Activity log (Settings → Activity, docs/AUDIT.md): who changed what, through the app, assistant, MCP or a job.
  api.use("/audit", auditRouter);
  // Server-Sent Events (live updates). Streams: never compress or buffer this route (see docs/DEVICES.md).
  api.use("/events", eventsRouter);
  api.use("/documents", documentsRouter);
  // Integrations page: Google per user (Calendar, Gmail bill suggestions, Drive). docs/INTEGRATIONS.md.
  api.use("/integrations", integrationsRouter);
  // Mail on the person's own Gmail (ai/skills/mail): their mails linked to projects; the reply job.
  api.use("/mail", mailRouter);
  // Notifications (docs/NOTIFICATIONS.md): the person's center, settings and push devices. Features send via notify().
  api.use("/notifications", notificationsRouter);
  api.use(notFoundHandler);
  api.use(errorHandler);

  app.use("/api", api);
  return app;
}
