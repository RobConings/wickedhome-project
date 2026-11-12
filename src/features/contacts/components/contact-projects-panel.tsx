import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import { useEffect } from "react";
import { LinkIcon, PencilIcon, UnlinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { GeneralFormField } from "@/components/shared/general-form";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { idSchema } from "@/types/common";
import type { ContactActionResult } from "../data/contacts-loaders";
import type { Contact } from "../types/contacts";

const schema = z.object({ projectId: idSchema, role: z.string().trim().max(60).optional().nullable() });

/** Contacts owns project roles and link/unlink. The route supplies the Projects-owned picker. */
export function ContactProjectsPanel({ contact, canManage, projectField }: { contact: Contact; canManage: boolean; projectField?: GeneralFormField }) {
  const { t } = useTranslation("contacts");
  const { t: common } = useTranslation();
  const fetcher = useFetcher<ContactActionResult>();
  useEffect(() => { if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError); }, [fetcher.state, fetcher.data]);
  const roleField: GeneralFormField = { name: "role", type: "text", label: t("fields.role"), maxLength: 60, placeholder: t("fields.rolePlaceholder") };
  return <Stack gap="md">
    {contact.projects.length ? <ul className="divide-y">{contact.projects.map((project) => <li key={project.id} className="flex flex-col gap-1 py-3">
      <RecordLink to={`/projects/${encodeURIComponent(project.id)}`} className="flex min-h-11 items-center gap-2 font-medium break-words hover:underline"><span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />{project.name}</RecordLink>
      {project.role && <Text size="sm" tone="muted">{project.role}</Text>}
      {canManage && <Inline gap="sm" align="stretch" wrap>
        <GeneralFormDialog<ContactActionResult> title={t("project.editRole")} schema={schema} intent="link" hiddenFields={{ contactId: contact.id, projectId: project.id }} fields={[roleField]} defaultValues={{ role: project.role ?? "", projectId: project.id }} successMessage={t("project.roleSaved")} trigger={<Button variant="outline" size="sm"><PencilIcon />{t("project.editRole")}</Button>} />
        <ConfirmDialog title={t("project.unlinkTitle", { name: project.name })} description={t("project.removeDescription")} confirmLabel={t("project.removeConfirm")} cancelLabel={common("actions.cancel")} destructive trigger={<Button variant="ghost" size="sm"><UnlinkIcon />{t("project.removeConfirm")}</Button>}
          onConfirm={() => fetcher.submit({ intent: "unlink", contactId: contact.id, projectId: project.id }, { method: "post" })} />
      </Inline>}
    </li>)}</ul> : <Text size="sm" tone="muted">{t("detail.noProjects")}</Text>}
    {canManage && projectField && <GeneralFormDialog<ContactActionResult> title={t("project.linkProject")} description={t("project.linkProjectHint")} schema={schema} intent="link" hiddenFields={{ contactId: contact.id }} fields={[projectField, roleField]} defaultValues={{ projectId: null, role: "" }} successMessage={t("project.linked")} trigger={<Button variant="outline" fullOnMobile><LinkIcon />{t("project.linkProject")}</Button>} />}
  </Stack>;
}
