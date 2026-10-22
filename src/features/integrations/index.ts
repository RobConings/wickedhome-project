// Public API of the integrations feature: the /integrations page and Google (per user). Routes and other features
// import from here only.
//
// Other integrations (Home Assistant, the assistant…) live in their own features and add a card to
// src/routes/integrations.tsx. Use `IntegrationCard` (icon, title, status badge) and, while the server lacks keys,
// `IntegrationSetupSteps` so every card reads the same.
export { IntegrationCard, IntegrationCardSkeleton, type IntegrationCardProps } from "./components/integration-card";
export { IntegrationSetupSteps } from "./components/integration-setup-steps";
export { IntegrationsSettingsLink } from "./components/integrations-settings-link";
export { IntegrationsScreen } from "./screens/integrations-screen";
export { canManageIntegrations, type IntegrationSetupStep, type IntegrationStatus } from "./types/integrations";

// Google
export { GoogleIntegrationCard } from "./components/google-integration-card";
// Expenses page: `suggestions={<MailBillSuggestions habitants shops payees today projectField />}` (loads itself).
export { MailBillSuggestions } from "./components/mail-bill-suggestions";
// Expense page: `fileNote={useMailFileNote(expenseId)}` on its DocumentAttachments shows "From mail on …".
export { MailOriginNote } from "./components/mail-origin-note";
export { useMailFileNote } from "./components/use-mail-file-note";
export { DriveFolderPickerDialog } from "./components/google-drive-panel";
// Integrations page (owners/adults): `<DriveStorageCard data={deferred(fetchDriveStorageStatus())} />`, bill documents in Drive.
export { DriveStorageCard } from "./components/drive-storage-card";
export { fetchDriveStorageStatus, driveStorageClient, type DriveStorageClient } from "./data/drive-storage-requests";
export type { DriveStorageStatus } from "./types/drive-storage";
// Documents page: `rootExtras={<LinkedDriveFolders />}` and `fileMenuItems={(file) => <SaveToDriveMenuItem file={file} />}`.
export { LinkedDriveFolders, SaveToDriveMenuItem } from "./components/drive-documents";
export { fetchGoogleStatus } from "./data/google-requests";
export { driveFolderLoader, type DriveFolderLoaderData } from "./data/drive-loaders";
export { DriveFolderScreen } from "./screens/drive-folder-screen";
export { googleClient, type GoogleClient } from "./data/google-client";
export type { GoogleStatus, MailBillSuggestion, DriveFolderLink } from "./types/google";
// Mail (assistant): the confirmation card of a mail (`kind: "mail"`, registered in src/app/assistant-previews.ts)
// and the project page's own mails: `mail={<ProjectMailThreadsPanel projectId={id} />}` (loads itself).
export { MailComposePreview } from "./components/mail-compose-preview";
export { ProjectMailThreadsPanel } from "./components/project-mail-threads";
export type { MailThreadInfo, ProjectMailThreads } from "./types/mail";
