import type { AccountsClient, MyAccountClient } from "@/features/auth/data/accounts-requests";
import type { LinkLoaderData } from "@/features/auth/data/link-loaders";
import type { AccountsOverview, CreatedInvite, LinkPreview, MyAccount } from "@/features/auth/types/accounts";
import type { SessionUser } from "@/features/auth/types/auth";

/** Example data for stories and tests. */
export const sessionUserFixture: SessionUser = {
  id: "u1",
  email: "rob@example.com",
  name: "Rob Coppens",
  role: "owner",
  locale: "en",
  householdId: "hh1",
  householdName: "Wicked Home",
  habitantId: "h1",
};

export const adultUserFixture: SessionUser = { ...sessionUserFixture, id: "u2", email: "clara@example.com", name: "Clara", role: "adult", habitantId: "h2" };

// ── Accounts ─────────────────────────────────────────────────────────────────

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export const LINK_TOKEN = "q3Jx8pV2mN7rT4wZ9bK1cF6hL0sD5gY2aE8uR3iO7nM";

export const accountsOverviewFixture: AccountsOverview = {
  accounts: [
    {
      id: "u1",
      email: "rob@example.com",
      role: "owner",
      person: { habitantId: "h1", name: "Rob", color: "#124734", emoji: null },
      lastLoginAt: minutesAgo(3),
      activeSessions: 2,
      disabled: false,
      resetLinkExpiresAt: null,
      createdAt: "2026-06-01T10:00:00Z",
    },
    {
      id: "u2",
      email: "clara@example.com",
      role: "adult",
      person: { habitantId: "h2", name: "Clara", color: "#c2508a", emoji: null },
      lastLoginAt: minutesAgo(60 * 26),
      activeSessions: 1,
      disabled: false,
      resetLinkExpiresAt: inDays(0.8),
      createdAt: "2026-07-01T10:00:00Z",
    },
    {
      id: "u3",
      email: "lotte@example.com",
      role: "child",
      person: { habitantId: "h3", name: "Lotte", color: "#d9912b", emoji: "🦄" },
      lastLoginAt: null,
      activeSessions: 0,
      disabled: true,
      resetLinkExpiresAt: null,
      createdAt: "2026-08-01T10:00:00Z",
    },
  ],
  pendingInvites: [
    {
      id: "i1",
      person: { habitantId: "h4", name: "Mats", color: "#3b82b6", emoji: null },
      role: "child",
      createdByName: "Rob",
      expiresAt: inDays(5),
      createdAt: minutesAgo(60 * 48),
    },
  ],
  invitableHabitants: [
    { habitantId: "h5", name: "Oma Jeanne", color: "#7c5cc4", emoji: null, type: "guest" },
    { habitantId: "h6", name: "Noor", color: "#7d9a3c", emoji: null, type: "child" },
  ],
  activeOwnerCount: 1,
};

/** The household right after setup: only the owner. */
export const ownerOnlyOverviewFixture: AccountsOverview = {
  accounts: [accountsOverviewFixture.accounts[0]!],
  pendingInvites: [],
  invitableHabitants: [],
  activeOwnerCount: 1,
};

export const createdInviteFixture: CreatedInvite = {
  kind: "invite",
  token: LINK_TOKEN,
  expiresAt: inDays(7),
  invite: {
    id: "i2",
    person: { habitantId: "h2", name: "Clara", color: "#c2508a", emoji: null },
    role: "adult",
    createdByName: "Rob",
    expiresAt: inDays(7),
    createdAt: new Date().toISOString(),
  },
};

const wait = <T>(value: T, ms = 700) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** Answers like the API, after a short delay, without changing anything. */
export const fakeAccountsClient: AccountsClient = {
  list: () => wait(accountsOverviewFixture),
  invite: () => wait(createdInviteFixture),
  revokeInvite: () => wait(undefined),
  changeRole: () => wait(undefined),
  setDisabled: () => wait(undefined),
  signOut: () => wait({ signedOut: 1 }),
  resetLink: () => wait({ kind: "password_reset", token: LINK_TOKEN, expiresAt: inDays(1) }),
  remove: () => wait(undefined),
};

// ── My account ───────────────────────────────────────────────────────────────

export const myAccountFixture: MyAccount = {
  email: "rob@example.com",
  sessions: [
    {
      key: "0",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      lastSeenAt: minutesAgo(1),
      createdAt: "2026-09-01T08:00:00Z",
      current: true,
    },
    {
      key: "1",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      lastSeenAt: minutesAgo(90),
      createdAt: "2026-09-10T08:00:00Z",
      current: false,
    },
    { key: "2", userAgent: null, lastSeenAt: minutesAgo(60 * 24 * 9), createdAt: "2026-08-20T08:00:00Z", current: false },
  ],
};

export const fakeMyAccountClient: MyAccountClient = {
  get: () => wait({ ...myAccountFixture, sessions: myAccountFixture.sessions.filter((session) => session.current) }),
  changeEmail: () => wait(undefined),
  changePassword: () => wait(undefined),
  signOutOthers: () => wait({ signedOut: 2 }),
};

// ── Link page ────────────────────────────────────────────────────────────────

export const validInvitePreview: LinkPreview = {
  status: "valid",
  kind: "invite",
  householdName: "Wicked Home",
  name: "Clara",
  role: "adult",
  email: null,
  inviterName: "Rob",
  expiresAt: inDays(6),
};

export const validResetPreview: LinkPreview = {
  status: "valid",
  kind: "password_reset",
  householdName: "Wicked Home",
  name: "Clara",
  role: "adult",
  email: "clara@example.com",
  inviterName: "Rob",
  expiresAt: inDays(0.9),
};

export const linkData = (preview: LinkPreview | null, extra: Partial<LinkLoaderData> = {}): LinkLoaderData => ({
  token: LINK_TOKEN,
  preview,
  problem: preview ? null : "invalid",
  currentUser: null,
  ...extra,
});
