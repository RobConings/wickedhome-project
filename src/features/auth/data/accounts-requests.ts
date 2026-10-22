import { api } from "../lib/api-client";
import type {
  AcceptInviteInput,
  AccountsOverview,
  ChangeEmailInput,
  ChangePasswordInput,
  CreatedInvite,
  CreatedLink,
  CreateInviteInput,
  LinkPreview,
  MyAccount,
  ResetPasswordInput,
} from "../types/accounts";
import type { Role } from "../types/auth";

const accountPath = (id: string, action = "") => `/auth/accounts/${encodeURIComponent(id)}${action}`;

// Links (public). The token goes in the body, never in an API URL.
export const lookupLink = (token: string) => api.post<LinkPreview>("/auth/links/lookup", { token });
export const acceptInvite = (input: AcceptInviteInput) => api.post("/auth/links/accept-invite", input);
export const resetPassword = (input: ResetPasswordInput) => api.post("/auth/links/reset-password", input);

// Accounts (owners and adults). Loader-friendly: the Settings route calls `fetchAccounts()` un-awaited.
export const fetchAccounts = () => api.get<AccountsOverview>("/auth/accounts");
// My account (everyone).
export const fetchMyAccount = () => api.get<MyAccount>("/auth/me/account");

/** What `AccountsSection` needs from the API; stories pass a fake. */
export type AccountsClient = {
  list: () => Promise<AccountsOverview>;
  invite: (input: CreateInviteInput) => Promise<CreatedInvite>;
  revokeInvite: (inviteId: string) => Promise<void>;
  changeRole: (userId: string, role: Role) => Promise<void>;
  setDisabled: (userId: string, disabled: boolean) => Promise<void>;
  signOut: (userId: string) => Promise<{ signedOut: number }>;
  resetLink: (userId: string) => Promise<CreatedLink>;
  remove: (userId: string) => Promise<void>;
};

export const accountsClient: AccountsClient = {
  list: fetchAccounts,
  invite: (input) => api.post<CreatedInvite>("/auth/accounts/invites", input),
  revokeInvite: (inviteId) => api.delete(`/auth/accounts/invites/${encodeURIComponent(inviteId)}`),
  changeRole: (userId, role) => api.put(accountPath(userId, "/role"), { role }),
  setDisabled: (userId, disabled) => api.post(accountPath(userId, disabled ? "/disable" : "/enable")),
  signOut: (userId) => api.post<{ signedOut: number }>(accountPath(userId, "/sign-out")),
  resetLink: (userId) => api.post<CreatedLink>(accountPath(userId, "/reset-link")),
  remove: (userId) => api.delete(accountPath(userId)),
};

/** What `MyAccountSection` needs from the API; stories pass a fake. */
export type MyAccountClient = {
  get: () => Promise<MyAccount>;
  changeEmail: (input: ChangeEmailInput) => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  signOutOthers: () => Promise<{ signedOut: number }>;
};

export const myAccountClient: MyAccountClient = {
  get: fetchMyAccount,
  changeEmail: (input) => api.put("/auth/me/email", input),
  changePassword: (input) => api.put("/auth/me/password", input),
  signOutOthers: () => api.post<{ signedOut: number }>("/auth/me/sign-out-others"),
};
