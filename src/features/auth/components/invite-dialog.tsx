import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Inline } from "./inline";
import { Stack } from "./stack";
import { ColorSwatchPicker } from "./color-swatch-picker";
import { FormField } from "./form-field";
import { InlineAlert } from "./inline-alert";
import { SegmentedControl } from "./segmented-control";
import { HABITANT_COLORS, HabitantAvatar } from "@/features/household";
import { ApiRequestError } from "../lib/api-client";
import { invitableRoles } from "../types/account-rules";
import {
  ACCOUNT_HABITANT_TYPES,
  createInviteInputSchema,
  linkPath,
  type AccountPerson,
  type CreatedInvite,
  type InvitableHabitant,
} from "../types/accounts";
import type { Role } from "../types/auth";
import type { AccountsClient } from "../data/accounts-requests";
import { ShareLinkPanel } from "./share-link-panel";

const NEW_PERSON = "__new__";

export type InvitePreset = { person: AccountPerson; role: Role };

type InviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Role of whoever invites: decides which roles can be handed out. */
  actorRole: Role;
  householdName: string;
  /** Habitants without an account or open invite. */
  habitants: InvitableHabitant[];
  /** "Make new link" for a pending invite: the person (and role) are fixed. */
  preset?: InvitePreset;
  client: Pick<AccountsClient, "invite">;
  /** A link was made; the raw token is in `created.token`, together with the full link. */
  onCreated: (created: CreatedInvite, url: string) => void;
  /** Stories: start on the link step. */
  initialCreated?: { created: CreatedInvite; url: string };
};

type Errors = Record<string, string[] | undefined>;

const defaultRole = (type: InvitableHabitant["type"] | undefined, roles: Role[]): Role =>
  type === "child" && roles.includes("child") ? "child" : roles.includes("adult") ? "adult" : (roles[0] ?? "child");

/**
 * Invite someone to log in: pick a habitant without an account (or add a new person inline), choose the
 * role, and get a link with a QR code to scan, copy or share. The link is shown only here, once.
 */
export function InviteDialog({
  open,
  onOpenChange,
  actorRole,
  householdName,
  habitants,
  preset,
  client,
  onCreated,
  initialCreated,
}: InviteDialogProps) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const roles = invitableRoles(actorRole);

  const [habitantId, setHabitantId] = React.useState<string>(habitants[0]?.habitantId ?? NEW_PERSON);
  const [newPerson, setNewPerson] = React.useState({ name: "", type: "adult" as InvitableHabitant["type"], color: HABITANT_COLORS[2] as string });
  const [role, setRole] = React.useState<Role>(preset?.role ?? defaultRole(habitants[0]?.type, roles));
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState(initialCreated ?? null);

  // Each opening starts fresh.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHabitantId(habitants[0]?.habitantId ?? NEW_PERSON);
      setNewPerson({ name: "", type: "adult", color: HABITANT_COLORS[2] });
      setRole(preset?.role ?? defaultRole(habitants[0]?.type, roles));
      setErrors({});
      setFormError(null);
      setResult(initialCreated ?? null);
    }
  }

  const isNew = !preset && habitantId === NEW_PERSON;
  const chosen = preset?.person ?? habitants.find((habitant) => habitant.habitantId === habitantId);
  const previewPerson = isNew ? { name: newPerson.name || "?", color: newPerson.color, emoji: null } : chosen;

  function pickHabitant(id: string) {
    setHabitantId(id);
    const type = id === NEW_PERSON ? newPerson.type : habitants.find((habitant) => habitant.habitantId === id)?.type;
    setRole(defaultRole(type, roles));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      role,
      ...(preset ? { habitantId: preset.person.habitantId } : isNew ? { newHabitant: newPerson } : { habitantId }),
    };
    const parsed = createInviteInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) (next[issue.path.join(".")] ??= []).push(issue.message);
      setErrors(next);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const created = await client.invite(parsed.data);
      const url = window.location.origin + linkPath("invite", created.token);
      setResult({ created, url });
      onCreated(created, url);
    } catch (error) {
      if (error instanceof ApiRequestError && error.fields) setErrors(error.fields);
      else if (error instanceof ApiRequestError && error.code === "has_account") setFormError(t("invite.errors.hasAccount"));
      else if (error instanceof ApiRequestError && error.status === 403) setFormError(t("invite.errors.forbidden"));
      else setFormError(tCommon("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        {result ? (
          <Stack gap="lg">
            <DialogHeader>
              <DialogTitle>{t("invite.readyTitle", { name: result.created.invite.person.name })}</DialogTitle>
              <DialogDescription>{t("invite.readyDescription")}</DialogDescription>
            </DialogHeader>
            <ShareLinkPanel
              url={result.url}
              kind="invite"
              personName={result.created.invite.person.name}
              householdName={householdName}
              expiresAt={result.created.expiresAt}
            />
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                {t("invite.done")}
              </Button>
            </DialogFooter>
          </Stack>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate>
            <fieldset disabled={busy} className="min-w-0">
              <Stack gap="lg">
                <DialogHeader>
                  <Inline gap="md">
                    {previewPerson && <HabitantAvatar habitant={previewPerson} size="lg" />}
                    <Stack gap="xs">
                      <DialogTitle>{preset ? t("invite.renewTitle", { name: preset.person.name }) : t("invite.title")}</DialogTitle>
                      <DialogDescription>{t("invite.description")}</DialogDescription>
                    </Stack>
                  </Inline>
                </DialogHeader>

                {formError && <InlineAlert tone="error">{formError}</InlineAlert>}

                {!preset && (
                  <FormField label={t("invite.person")} htmlFor="invite-person" errors={errors.habitantId}>
                    <Select value={habitantId} onValueChange={pickHabitant}>
                      <SelectTrigger id="invite-person" className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {habitants.map((habitant) => (
                          <SelectItem key={habitant.habitantId} value={habitant.habitantId}>
                            {habitant.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={NEW_PERSON}>{t("invite.newPerson")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                )}

                {isNew && (
                  <Stack gap="md" className="rounded-lg border p-3">
                    <FormField label={t("invite.newName")} htmlFor="invite-name" errors={errors["newHabitant.name"]}>
                      <Input
                        id="invite-name"
                        value={newPerson.name}
                        autoComplete="off"
                        className="h-10"
                        onChange={(event) => setNewPerson((value) => ({ ...value, name: event.target.value }))}
                      />
                    </FormField>
                    <Stack gap="sm">
                      <span className="text-sm font-medium">{t("invite.newType")}</span>
                      <SegmentedControl
                        label={t("invite.newType")}
                        value={newPerson.type}
                        options={ACCOUNT_HABITANT_TYPES.map((type) => ({ value: type, label: t(`household:types.${type}`) }))}
                        onChange={(type) => {
                          setNewPerson((value) => ({ ...value, type }));
                          setRole(defaultRole(type, roles));
                        }}
                      />
                    </Stack>
                    <Stack gap="sm">
                      <span className="text-sm font-medium">{t("invite.newColor")}</span>
                      <ColorSwatchPicker
                        name="invite-color"
                        label={t("invite.newColor")}
                        colors={HABITANT_COLORS}
                        defaultValue={newPerson.color}
                        onChange={(color) => setNewPerson((value) => ({ ...value, color }))}
                      />
                    </Stack>
                  </Stack>
                )}

                <FormField
                  label={t("invite.role")}
                  htmlFor="invite-role"
                  description={t(`roles.${role}Hint`)}
                  errors={errors.role}
                >
                  <Select value={role} onValueChange={(value) => setRole(value as Role)} disabled={Boolean(preset)}>
                    <SelectTrigger id="invite-role" className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`roles.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <DialogFooter>
                  <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                    {tCommon("actions.cancel")}
                  </Button>
                  <Button type="submit" size="lg" loading={busy}>
                    {busy ? t("invite.creating") : t("invite.create")}
                  </Button>
                </DialogFooter>
              </Stack>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
