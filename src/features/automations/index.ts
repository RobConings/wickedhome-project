// Public API of the automations feature (the app's scheduled jobs, src/api/jobs). Shown on the Settings page
// (src/routes/settings.tsx): the loader passes `fetchAutomations()` un-awaited (null on failure) and the route
// adds `<AutomationsSection data={data.automations} />` as an extra section. The section does its own requests
// for pausing, running and polling, so the route needs no action for it.
export { AutomationsSection } from "./components/automations-section";
export { JobRunStatusBadge } from "./components/job-run-status-badge";
export { fetchAutomations, type AutomationsClient } from "./data/automations-requests";
export type { AutomationJob, AutomationsOverview, JobRun, JobRunStatus } from "./types/automations";
