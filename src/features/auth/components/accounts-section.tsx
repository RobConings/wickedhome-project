import * as React from "react";
import {
  BanIcon,
  CircleCheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LinkIcon,
  LogOutIcon,
  MoreVerticalIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "./card";
import { ErrorState } from "./error-state";
import { SkeletonList } from "./loading-state";
import { HabitantAvatar } from "@/features/household";
import { ApiRequestError } from "../lib/api-client";
import { currentLocale } from "@/lib/i18n";
import { accountsClient, type AccountsClient } from "../data/accounts-requests";
import { accountActionError, canManageInvite, invitableRoles, type AccountAction } from "../types/account-rules";
import { linkPath, type AccountSummary, type AccountsOverview, type PendingInvite } from "../types/accounts";
import type { Role, SessionUser } from "../types/auth";
import { initials, relativeTime } from "./account-format";
import { InviteDialog, type InvitePreset } from "./invite-dialog";
import { ShareLinkDialog, type SharedLink } from "./share-link-dialog";

type AccountsSectionProps = {
  /**
   * From the Settings route's loader: the data, or a deferred (un-awaited) promise of it (skeleton until it
   * resolves). `null` (loading failed) shows an error with Retry; leave it out to load here.
   */
  data?: AccountsOverview | null | Promise<AccountsOverview | null>;
  /** Who is looking: their role decides what they may do. */
  actor: Pick<SessionUser, "id" | "role" | "householdName">;
  /** API access; stories pass a fake. */
  client?: AccountsClient;
};

/** Read outside render (event handlers, reloads) for relative times. */
const clock = () => Date.now();

type State = { status: "loading" } | { status: "error" } | { status: "ready"; overview: AccountsOverview };

const initialState = (data: AccountsOverview | null | undefined): State =>
  data ? { status: "ready", overview: data } : data === null ? { status: "error" } : { status: "loading" };

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<void>;
};

function AccountsSkeleton() {
  const { t } = useTranslation("auth");
  return (
    <Card aria-busy="true" aria-label={t("accounts.loading")}>
      <SkeletonList rows={3} />
    </Card>
  );
}

function DeferredAccounts({ promise, ...props }: Omit<AccountsSectionProps, "data"> & { promise: Promise<AccountsOverview | null> }) {
  return <AccountsPanel data={React.use(promise)} {...props} />;
}

/**
 * Settings → Accounts (owners and adults): who can log in, pending invites, and everything to manage them:
 * invite, change role, disable, sign out everywhere, password-reset link, remove.
 */
export function AccountsSection({ data, ...props }: AccountsSectionProps) {
  if (data instanceof Promise) {
    return (
      <React.Suspense fallback={<AccountsSkeleton />}>
        <DeferredAccounts promise={data} {...props} />
      </React.Suspense>
    );
  }
  return <AccountsPanel data={data} {...props} />;
}

function AccountsPanel({ data, actor, client = accountsClient }: Omit<AccountsSectionProps, "data"> & { data?: AccountsOverview | null }) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const revalidator = useRevalidator();
  const [state, setState] = React.useState<State>(() => initialState(data));
  const [reloads, setReloads] = React.useState(0);
  const [busyIds, setBusyIds] = React.useState<ReadonlySet<string>>(new Set());
  const [inviteDialog, setInviteDialog] = React.useState<{ open: boolean; preset?: InvitePreset }>({ open: false });
  const [shared, setShared] = React.useState<SharedLink | null>(null);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  /** Invite links made in this session, by invite id: the raw token is never stored anywhere else. */
  const [inviteLinks, setInviteLinks] = React.useState<ReadonlyMap<string, string>>(new Map());
  /** "Now" for relative times; moves on with every reload. */
  const [now, setNow] = React.useState(clock);

  const [previousData, setPreviousData] = React.useState(data);
  if (data !== previousData) {
    setPreviousData(data);
    if (data !== undefined) setState(initialState(data));
  }

  React.useEffect(() => {
    if (data !== undefined && reloads === 0) return;
    let cancelled = false;
    client
      .list()
      .then((overview) => !cancelled && setState({ status: "ready", overview }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [client, data, reloads]);

  /** Reloads the list, keeping the old one on screen meanwhile. */
  async function refresh() {
    try {
      setState({ status: "ready", overview: await client.list() });
      setNow(clock());
    } catch {
      toast.error(t("accounts.refreshFailed"));
    }
  }

  async function withBusy(id: string, work: () => Promise<void>) {
    setBusyIds((current) => new Set(current).add(id));
    try {
      await work();
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function errorMessage(error: unknown): string {
    if (error instanceof ApiRequestError) {
      if (error.code === "last_owner") return t("accounts.errors.lastOwner");
      if (error.code === "self") return t("accounts.errors.self");
      if (error.status === 403) return t("accounts.errors.forbidden");
      if (error.status === 404) return t("accounts.errors.gone");
    }
    return tCommon("errors.generic");
  }

  /** Runs an account change with a busy row, a toast and a reload. */
  function act(id: string, work: () => Promise<unknown>, success: string, { self = false } = {}) {
    return withBusy(id, async () => {
      try {
        await work();
        toast.success(success);
        await refresh();
        // Your own role or sessions changed: the session (and with it the menus) reloads.
        if (self) await revalidator.revalidate();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  if (state.status === "loading") return <AccountsSkeleton />;
  if (state.status === "error") {
    return (
      <Card>
        <ErrorState
          className="py-8"
          title={t("accounts.error")}
          description={t("accounts.errorDescription")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setState({ status: "loading" });
                setReloads((value) => value + 1);
              }}
            >
              {tCommon("actions.retry")}
            </Button>
          }
        />
      </Card>
    );
  }

  const { overview } = state;
  const personName = (account: AccountSummary) => account.person?.name ?? account.email;
  const allowed = (account: AccountSummary, action: AccountAction) =>
    accountActionError(actor, { id: account.id, role: account.role, disabled: account.disabled }, action, overview.activeOwnerCount) === null;

  function changeRole(account: AccountSummary, role: Role) {
    const self = account.id === actor.id;
    const run = () => act(account.id, () => client.changeRole(account.id, role), t("accounts.toast.roleChanged", { name: personName(account), role: t(`roles.${role}`) }), { self });
    if (role === "owner" || self) {
      setConfirmation({
        title: self ? t("accounts.confirm.demoteSelfTitle") : t("accounts.confirm.ownerTitle", { name: personName(account) }),
        description: self ? t("accounts.confirm.demoteSelfDescription", { role: t(`roles.${role}`) }) : t("accounts.confirm.ownerDescription"),
        confirmLabel: t("accounts.confirm.changeRole"),
        run,
      });
    } else {
      void run();
    }
  }

  function resetLink(account: AccountSummary) {
    void withBusy(account.id, async () => {
      try {
        const link = await client.resetLink(account.id);
        setShared({ url: window.location.origin + linkPath("password_reset", link.token), kind: "password_reset", personName: personName(account), expiresAt: link.expiresAt });
        await refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  function renewInvite(invite: PendingInvite) {
    setInviteDialog({ open: true, preset: { person: invite.person, role: invite.role } });
  }

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("accounts.summary", { count: overview.accounts.length })}
          {overview.pendingInvites.length > 0 && ` · ${t("accounts.pendingSummary", { count: overview.pendingInvites.length })}`}
        </p>
        <Button size="lg" onClick={() => setInviteDialog({ open: true })} className="w-full sm:w-auto">
          <UserPlusIcon />
          {t("accounts.invite")}
        </Button>
      </div>

      <ul className="flex flex-col divide-y" aria-label={t("accounts.listLabel")}>
        {overview.accounts.map((account) => (
          <AccountItem
            key={account.id}
            account={account}
            isMe={account.id === actor.id}
            now={now}
            busy={busyIds.has(account.id)}
            roles={invitableRoles(actor.role).filter((role) => allowed(account, { type: "changeRole", role }) || role === account.role)}
            can={{
              changeRole: invitableRoles(actor.role).some((role) => role !== account.role && allowed(account, { type: "changeRole", role })),
              disable: !account.disabled && allowed(account, { type: "disable" }),
              enable: account.disabled && allowed(account, { type: "enable" }),
              signOut: !account.disabled && account.activeSessions > 0 && allowed(account, { type: "signOut" }) && account.id !== actor.id,
              resetLink: !account.disabled && allowed(account, { type: "resetLink" }),
              // Removing yourself is possible in the API but not offered here; your own login stays.
              remove: account.id !== actor.id && allowed(account, { type: "remove" }),
            }}
            lastOwner={account.role === "owner" && !account.disabled && overview.activeOwnerCount <= 1}
            onChangeRole={(role) => changeRole(account, role)}
            onDisable={() =>
              setConfirmation({
                title: t("accounts.confirm.disableTitle", { name: personName(account) }),
                description: t("accounts.confirm.disableDescription"),
                confirmLabel: t("accounts.actions.disable"),
                destructive: true,
                run: () => act(account.id, () => client.setDisabled(account.id, true), t("accounts.toast.disabled", { name: personName(account) })),
              })
            }
            onEnable={() => void act(account.id, () => client.setDisabled(account.id, false), t("accounts.toast.enabled", { name: personName(account) }))}
            onSignOut={() =>
              setConfirmation({
                title: t("accounts.confirm.signOutTitle", { name: personName(account) }),
                description: t("accounts.confirm.signOutDescription"),
                confirmLabel: t("accounts.actions.signOut"),
                run: () => act(account.id, () => client.signOut(account.id), t("accounts.toast.signedOut", { name: personName(account) })),
              })
            }
            onResetLink={() => resetLink(account)}
            onRemove={() =>
              setConfirmation({
                title: t("accounts.confirm.removeTitle", { name: personName(account) }),
                description: t("accounts.confirm.removeDescription", { name: personName(account) }),
                confirmLabel: t("accounts.actions.remove"),
                destructive: true,
                run: () => act(account.id, () => client.remove(account.id), t("accounts.toast.removed", { name: personName(account) })),
              })
            }
          />
        ))}
        {overview.pendingInvites.map((invite) => (
          <InviteItem
            key={invite.id}
            invite={invite}
            now={now}
            busy={busyIds.has(invite.id)}
            canManage={canManageInvite(actor.role, invite.role)}
            link={inviteLinks.get(invite.id)}
            onCopy={(url) => setShared({ url, kind: "invite", personName: invite.person.name, expiresAt: invite.expiresAt })}
            onRenew={() => renewInvite(invite)}
            onRevoke={() =>
              setConfirmation({
                title: t("accounts.confirm.revokeTitle", { name: invite.person.name }),
                description: t("accounts.confirm.revokeDescription"),
                confirmLabel: t("accounts.actions.revoke"),
                destructive: true,
                run: () => act(invite.id, () => client.revokeInvite(invite.id), t("accounts.toast.revoked", { name: invite.person.name })),
              })
            }
          />
        ))}
      </ul>

      <InviteDialog
        open={inviteDialog.open}
        onOpenChange={(open) => setInviteDialog((current) => ({ ...current, open }))}
        actorRole={actor.role}
        householdName={actor.householdName}
        habitants={overview.invitableHabitants}
        preset={inviteDialog.preset}
        client={client}
        onCreated={(created, url) => {
          setInviteLinks((current) => new Map(current).set(created.invite.id, url));
          void refresh();
        }}
      />
      <ShareLinkDialog link={shared} householdName={actor.householdName} onClose={() => setShared(null)} />

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && !confirming && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>{tCommon("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={confirmation?.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              disabled={confirming}
              aria-busy={confirming || undefined}
              onClick={(event) => {
                // Stays open with a busy button until the change is done.
                event.preventDefault();
                if (!confirmation) return;
                setConfirming(true);
                void confirmation.run().finally(() => {
                  setConfirming(false);
                  setConfirmation(null);
                });
              }}
            >
              {confirming && <Spinner />}
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type AccountItemProps = {
  account: AccountSummary;
  isMe: boolean;
  now: number;
  busy: boolean;
  /** Roles offered in the menu. */
  roles: Role[];
  can: Record<"changeRole" | "disable" | "enable" | "signOut" | "resetLink" | "remove", boolean>;
  lastOwner: boolean;
  onChangeRole: (role: Role) => void;
  onDisable: () => void;
  onEnable: () => void;
  onSignOut: () => void;
  onResetLink: () => void;
  onRemove: () => void;
};

function AccountItem({ account, isMe, now, busy, roles, can, lastOwner, ...on }: AccountItemProps) {
  const { t } = useTranslation("auth");
  const locale = currentLocale();
  const name = account.person?.name ?? account.email;
  const hasActions = Object.values(can).some(Boolean);

  return (
    <li className="flex min-w-0 items-start gap-3 py-3" aria-busy={busy || undefined}>
      {account.person ? (
        <HabitantAvatar habitant={account.person} className={account.disabled ? "opacity-50" : undefined} />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">{initials(name)}</span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{name}</span>
          {isMe && <Badge variant="outline">{t("accounts.you")}</Badge>}
          <Badge variant="secondary">{t(`roles.${account.role}`)}</Badge>
          {account.disabled ? (
            <Badge variant="destructive">{t("accounts.status.disabled")}</Badge>
          ) : (
            <Badge variant="outline" className="border-success/40 text-success">
              {t("accounts.status.active")}
            </Badge>
          )}
        </div>
        <span className="truncate text-sm text-muted-foreground">{account.email}</span>
        <span className="text-xs text-muted-foreground">
          {account.lastLoginAt
            ? t("accounts.lastLogin", { when: relativeTime(account.lastLoginAt, locale, now) })
            : t("accounts.neverLoggedIn")}
          {" · "}
          {t("accounts.sessions", { count: account.activeSessions })}
        </span>
        {account.resetLinkExpiresAt && (
          <span className="text-xs text-muted-foreground">
            {t("accounts.resetPending", { when: relativeTime(account.resetLinkExpiresAt, locale, now) })}
          </span>
        )}
        {lastOwner && isMe && <span className="text-xs text-muted-foreground">{t("accounts.lastOwnerHint")}</span>}
      </div>
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" disabled={busy} aria-label={t("accounts.actionsFor", { name })}>
              {busy ? <Spinner /> : <MoreVerticalIcon />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {can.changeRole && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">{t("accounts.actions.role")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={account.role} onValueChange={(value) => value !== account.role && on.onChangeRole(value as Role)}>
                  {roles.map((role) => (
                    <DropdownMenuRadioItem key={role} value={role}>
                      {t(`roles.${role}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
              </>
            )}
            {can.resetLink && (
              <DropdownMenuItem onSelect={on.onResetLink}>
                <KeyRoundIcon />
                {t("accounts.actions.resetLink")}
              </DropdownMenuItem>
            )}
            {can.signOut && (
              <DropdownMenuItem onSelect={on.onSignOut}>
                <LogOutIcon />
                {t("accounts.actions.signOut")}
              </DropdownMenuItem>
            )}
            {can.enable && (
              <DropdownMenuItem onSelect={on.onEnable}>
                <CircleCheckIcon />
                {t("accounts.actions.enable")}
              </DropdownMenuItem>
            )}
            {can.disable && (
              <DropdownMenuItem onSelect={on.onDisable}>
                <BanIcon />
                {t("accounts.actions.disable")}
              </DropdownMenuItem>
            )}
            {can.remove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={on.onRemove}>
                  <Trash2Icon />
                  {t("accounts.actions.remove")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

type InviteItemProps = {
  invite: PendingInvite;
  now: number;
  busy: boolean;
  canManage: boolean;
  /** The link, when it was made in this session. */
  link?: string;
  onCopy: (url: string) => void;
  onRenew: () => void;
  onRevoke: () => void;
};

function InviteItem({ invite, now, busy, canManage, link, onCopy, onRenew, onRevoke }: InviteItemProps) {
  const { t } = useTranslation("auth");
  const locale = currentLocale();
  return (
    <li className="flex min-w-0 items-start gap-3 py-3" aria-busy={busy || undefined}>
      <HabitantAvatar habitant={invite.person} className="opacity-70" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{invite.person.name}</span>
          <Badge variant="secondary">{t(`roles.${invite.role}`)}</Badge>
          <Badge variant="outline" className="border-dashed">
            <UsersIcon />
            {t("accounts.status.invited")}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {invite.createdByName ? t("accounts.invitedBy", { name: invite.createdByName }) : t("accounts.invitedPending")}
          {" · "}
          {t("accounts.inviteExpires", { when: relativeTime(invite.expiresAt, locale, now) })}
        </span>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" disabled={busy} aria-label={t("accounts.actionsFor", { name: invite.person.name })}>
              {busy ? <Spinner /> : <MoreVerticalIcon />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {link && (
              <DropdownMenuItem onSelect={() => onCopy(link)}>
                <CopyIcon />
                {t("accounts.actions.showLink")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onRenew}>
              <LinkIcon />
              {t("accounts.actions.newLink")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRevoke}>
              <XIcon />
              {t("accounts.actions.revoke")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
