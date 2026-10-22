import * as React from "react";
import { LinkIcon, PlusIcon, UserMinusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardDescription, CardTitle } from "./card";
import { ConfirmDialog } from "./confirm-dialog";
import type { GeneralFormField } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { PendingContent } from "./loading-state";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { ContactActionResult } from "../data/contacts-loaders";
import { fetchContacts, unlinkContactFromProject } from "../data/contacts-requests";
import { useContactSelections } from "../data/use-contact-selections";
import { PROJECT_ROLE_SUGGESTIONS, type Contact } from "../types/contacts";
import { ContactAvatar } from "./contact-avatar";
import { ContactFormDialog } from "./contact-form-dialog";
import { ContactLinks } from "./contact-links";
import { ContactPicker } from "./contact-picker";
import { TradeInput } from "./trade-input";

type ProjectContactsPanelProps = {
  projectId: string;
  /** Owners and adults link, unlink and add contacts. */
  canManage: boolean;
  /** Data instead of fetching it (stories, tests). */
  initialData?: { contacts: Contact[] };
  /** Seed favourites/recents of the picker (stories). */
  initialSelections?: UseSelectionsOptions["initial"];
};

type State = { status: "loading" } | { status: "error" } | { status: "ready"; contacts: Contact[] };

/** The route the panel posts to (the contacts page's action). */
const CONTACTS_ACTION = "/contacts";

const linkFormSchema = z.object({ contactId: z.string().min(1, "chooseContact"), role: z.string().trim().max(60).optional() });

/**
 * The contacts of one project, for the project page: who works on it and as what (contractor, architect…), tap to
 * call or mail, link an existing contact with a role, add a new one (linked right away) or remove one from the
 * project. Loads its own data, so the projects feature only renders it; changes post to the contacts route.
 */
export function ProjectContactsPanel({ projectId, canManage, initialData, initialSelections }: ProjectContactsPanelProps) {
  const { t } = useTranslation("contacts");
  const { t: tCommon } = useTranslation();
  const [state, setState] = React.useState<State>(() => (initialData ? { status: "ready", ...initialData } : { status: "loading" }));
  const [reloads, setReloads] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const { recordUse } = useContactSelections({ initial: initialSelections });

  const reload = React.useCallback(() => {
    setRefreshing(true);
    setReloads((value) => value + 1);
  }, []);

  React.useEffect(() => {
    if (initialData && reloads === 0) return;
    let cancelled = false;
    fetchContacts()
      .then((contacts) => {
        if (!cancelled) setState({ status: "ready", contacts });
      })
      .catch(() => {
        if (!cancelled) setState((previous) => (previous.status === "ready" ? previous : { status: "error" }));
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloads, initialData]);

  const unlink = async (contact: Contact) => {
    try {
      await unlinkContactFromProject(contact.id, projectId);
      toast.success(t("project.removed"));
      reload();
    } catch {
      toast.error(tCommon("errors.generic"));
    }
  };

  const header = (
    <div className="flex flex-col gap-1">
      <CardTitle>{t("project.title")}</CardTitle>
      <CardDescription>{t("project.description")}</CardDescription>
    </div>
  );

  if (state.status === "loading") {
    return (
      <Card>
        {header}
        <div className="flex flex-col gap-2" role="status" aria-label={t("project.loading")}>
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      </Card>
    );
  }
  if (state.status === "error") {
    return (
      <Card>
        {header}
        <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
          {t("project.error")}
          <Button variant="outline" size="sm" fullOnMobile onClick={() => setReloads((value) => value + 1)}>
            {tCommon("actions.retry")}
          </Button>
        </div>
      </Card>
    );
  }

  const { contacts } = state;
  const linked = contacts
    .map((contact) => ({ contact, link: contact.projects.find((project) => project.id === projectId) }))
    .filter((entry): entry is { contact: Contact; link: NonNullable<typeof entry.link> } => Boolean(entry.link));
  const unlinked = contacts.filter((contact) => !contact.projects.some((project) => project.id === projectId));
  const knownRoles = [...new Set(contacts.flatMap((contact) => contact.projects.map((project) => project.role ?? "")).filter(Boolean))];

  const linkFields: GeneralFormField[] = [
    {
      name: "contactId",
      type: "custom",
      label: t("fields.contact"),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ContactPicker
          id={id}
          name={name}
          contacts={unlinked}
          value={typeof value === "string" ? value : null}
          onChange={(next) => {
            setValue(next);
          }}
          invalid={invalid}
          disabled={disabled}
          initialSelections={initialSelections}
        />
      ),
    },
    {
      name: "role",
      type: "custom",
      label: t("fields.role"),
      render: ({ id, name, value, setValue, invalid, describedBy, disabled }) => (
        <TradeInput
          id={id}
          name={name}
          value={typeof value === "string" ? value : ""}
          onChange={setValue}
          suggestions={PROJECT_ROLE_SUGGESTIONS}
          extra={knownRoles}
          placeholder={t("fields.rolePlaceholder")}
          invalid={invalid}
          describedBy={describedBy}
          disabled={disabled}
        />
      ),
    },
  ];

  return (
    <Card>
      {header}
      <PendingContent pending={refreshing} label={tCommon("loading.updating")}>
        {linked.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{t("project.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {linked.map(({ contact, link }) => (
              <li key={contact.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <ContactAvatar name={contact.name} size="md" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium break-words">{contact.name}</span>
                    {(link.role || contact.company) && (
                      <span className="text-sm break-words text-muted-foreground">{[link.role, contact.company].filter(Boolean).join(" · ")}</span>
                    )}
                  </div>
                  <ContactLinks contact={contact} />
                </div>
                {canManage && (
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground"
                        aria-label={t("project.remove", { name: contact.name })}
                        title={t("project.remove", { name: contact.name })}
                      >
                        <UserMinusIcon />
                      </Button>
                    }
                    title={t("project.removeTitle", { name: contact.name })}
                    description={t("project.removeDescription")}
                    confirmLabel={t("project.removeConfirm")}
                    cancelLabel={tCommon("actions.cancel")}
                    destructive
                    onConfirm={() => unlink(contact)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </PendingContent>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <GeneralFormDialog<ContactActionResult>
            trigger={
              <Button variant="outline" size="sm" fullOnMobile>
                <LinkIcon />
                {t("project.link")}
              </Button>
            }
            title={t("project.linkTitle")}
            description={t("project.linkDescription")}
            contentClassName="sm:max-w-md"
            schema={linkFormSchema}
            intent="link"
            action={CONTACTS_ACTION}
            hiddenFields={{ projectId }}
            fields={linkFields}
            defaultValues={{ contactId: null, role: "" }}
            translateError={(message) => (message === "chooseContact" ? t("errors.chooseContact") : message)}
            submitLabel={
              <>
                <LinkIcon />
                {t("project.linkSubmit")}
              </>
            }
            successMessage={t("project.linked")}
            onSuccess={(result) => {
              if (result.contactId) void recordUse(result.contactId);
              reload();
            }}
          />
          <ContactFormDialog
            projectId={projectId}
            knownTrades={knownRoles}
            action={CONTACTS_ACTION}
            onSaved={reload}
            trigger={
              <Button variant="ghost" size="sm" fullOnMobile>
                <PlusIcon />
                {t("project.new")}
              </Button>
            }
          />
        </div>
      )}
    </Card>
  );
}
