import * as React from "react";
import { LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { EntityPicker, type EntityPickerItem } from "@/components/shared/entity-picker";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { ProjectActionResult } from "../data/projects-loaders";
import { fetchProjectCandidates } from "../data/projects-requests";
import type { ProjectCandidates } from "../types/projects";
import { useProjectText } from "./use-project-text";

type LinkKind = "task" | "expense" | "recurring";

type LinkToProjectDialogProps = {
  projectId: string;
  /** What to link: open tasks, one-off expenses, or recurring expenses (with all their instances). */
  kind: LinkKind;
  trigger: React.ReactElement;
  /** Seed data instead of fetching (stories). */
  initialCandidates?: ProjectCandidates;
  /** After linking, with what was linked (e.g. to offer "Link materials" for an expense). */
  onLinked?: (itemId: string) => void;
};

/** Something has to be chosen before linking. */
const linkFormSchema = z.object({ itemId: z.string().min(1) });

/**
 * Link something that already exists to the project, chosen from what isn't linked to a project yet. A
 * `GeneralFormDialog` posting `link`; the candidates load afresh on every opening.
 */
export function LinkToProjectDialog({ projectId, kind, trigger, initialCandidates, onLinked }: LinkToProjectDialogProps) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState(0);
  const [candidates, setCandidates] = React.useState<ProjectCandidates | null>(initialCandidates ?? null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!open || initialCandidates) return;
    let cancelled = false;
    fetchProjectCandidates()
      .then((result) => !cancelled && setCandidates(result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // Each opening loads afresh: what was just linked is no longer a candidate.
  }, [open, session, initialCandidates]);

  const items = React.useMemo<EntityPickerItem[]>(() => {
    if (!candidates) return [];
    if (kind === "task") {
      return candidates.tasks.map((task) => ({ id: task.id, label: task.title, description: task.dueDate ? text.date(task.dueDate) : undefined }));
    }
    if (kind === "expense") {
      return candidates.expenses.map((expense) => ({
        id: expense.id,
        label: expense.payee,
        description: `${text.money(expense.amountCents)} · ${text.date(expense.paidOn ?? expense.dueDate)}${expense.paidOn ? "" : ` · ${t("expenses.unpaid")}`}`,
      }));
    }
    return candidates.recurring.map((item) => ({ id: item.id, label: item.payee, description: text.money(item.amountCents) }));
  }, [candidates, kind, t, text]);

  const fields: GeneralFormField[] = [
    {
      name: "itemId",
      type: "custom",
      label: t(`link.label.${kind}`),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <EntityPicker
          id={id}
          name={name}
          items={items}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          loading={!candidates && !failed}
          disabled={disabled}
          placeholder={t(`link.placeholder.${kind}`)}
          labels={{ empty: t(`link.empty.${kind}`) }}
        />
      ),
    },
  ];

  return (
    <GeneralFormDialog<ProjectActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFailed(false);
          setSession((value) => value + 1);
        }
        setOpen(next);
      }}
      title={t(`link.title.${kind}`)}
      description={t(`link.description.${kind}`)}
      contentClassName="sm:max-w-md"
      schema={linkFormSchema}
      intent="link"
      hiddenFields={{ id: projectId, kind }}
      fields={fields}
      defaultValues={{ itemId: null }}
      intro={failed ? <InlineAlert tone="error">{t("link.failed")}</InlineAlert> : undefined}
      submitLabel={
        <>
          <LinkIcon />
          {t("link.submit")}
        </>
      }
      successMessage={t(`link.done.${kind}`)}
      onSuccess={(result) => {
        if (result.itemId) onLinked?.(result.itemId);
      }}
    />
  );
}
