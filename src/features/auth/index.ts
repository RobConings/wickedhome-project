// Public API of the auth feature. Routes, the app frame and other features import from here only.
export { AccountMenu } from "./components/account-menu";
export {
  SESSION_ROUTE_ID,
  loginAction,
  loginLoader,
  logoutAction,
  sessionLoader,
  sessionShouldRevalidate,
  setupAction,
  setupLoader,
  type SessionLoaderData,
} from "./data/auth-loaders";
export { useCurrentUser, useOptionalCurrentUser } from "./data/use-current-user";
export { LoginScreen } from "./screens/login-screen";
export { SetupScreen } from "./screens/setup-screen";
export type { Role, SessionUser } from "./types/auth";
// Household accounts (docs/ACCOUNTS.md): invite / reset link page (public), and the Settings sections
// "My account" (everyone) and "Accounts" (owners and adults). The Settings route passes `fetchMyAccount()`
// and `fetchAccounts()` un-awaited (null on failure); the sections do their own requests after that.
export { AccountsSection } from "./components/accounts-section";
export { MyAccountSection } from "./components/my-account-section";
export { fetchAccounts, fetchMyAccount } from "./data/accounts-requests";
export { linkAction, linkLoader } from "./data/link-loaders";
export { LinkScreen } from "./screens/link-screen";
export { canManageAccounts } from "./types/account-rules";
