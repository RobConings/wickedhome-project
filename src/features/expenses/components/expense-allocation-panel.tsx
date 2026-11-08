import { RecordLink as Link } from "@/components/shared/record-link";
import { useEffect, useState } from "react";
import { FolderKanbanIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { EntityPicker } from "@/components/shared/entity-picker";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { MoneyInput } from "@/components/shared/money-input";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchProjects } from "@/features/projects";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { fetchExpenseAllocation } from "../data/project-allocation-requests";
import { projectAllocationFormSchema, type ExpenseAllocationView } from "../types/project-allocation";

export function ExpenseAllocationPanel({ expenseId, initial, initialProjects }: {
  expenseId: string; initial?: ExpenseAllocationView; initialProjects?: { id: string; name: string }[];
}) {
  const { t } = useTranslation("expenses");
  const money = (value: number) => formatCurrency(value, currentLocale());
  const revalidator = useRevalidator();
  const [data, setData] = useState(initial ?? null);
  const [projects, setProjects] = useState(initialProjects ?? []);
  const [editing, setEditing] = useState<ExpenseAllocationView | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if ((initial && initialProjects) || revalidator.state !== "idle") return;
    let active = true;
    Promise.all([fetchExpenseAllocation(expenseId), fetchProjects()]).then(([value, list]) => {
      if (active) { setData(value); setProjects(list.projects); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [expenseId, initial, initialProjects, refresh, revalidator.state]);
  if (failed) return <ErrorState title={t("allocation.loadError")} action={<Button onClick={() => setRefresh((value) => value + 1)}>{t("allocation.retry")}</Button>} />;
  if (!data) return <Skeleton className="h-48" />;
  const draft = editing ?? data;
  return <Card id="expense-allocation" className="scroll-mt-20">
    <CardHeader className="flex-wrap"><div className="min-w-[min(100%,12rem)] flex-1"><CardTitle>{t("allocation.title")}</CardTitle><CardDescription>{t("allocation.description")}</CardDescription></div>
      <GeneralFormDialog onOpenChange={(open) => setEditing(open ? data : null)} title={t("allocation.edit")} description={t("allocation.editDescription")}
        trigger={<Button variant="outline"><FolderKanbanIcon />{t("allocation.edit")}</Button>}
        intent="allocate" hiddenFields={{ id: expenseId, revision: draft.revision }} schema={projectAllocationFormSchema}
        defaultValues={{ householdCents: draft.householdCents, projects: draft.projects.map((row) => ({ projectId: row.projectId ?? "", amountCents: row.amountCents })) }}
        fields={[
          { name: "householdCents", type: "money", label: t("allocation.household") },
          { name: "projects", type: "custom", label: t("allocation.projects"), render: ({ name, value, setValue, values, disabled }) => {
            const rows = (Array.isArray(value) ? value : []) as { projectId: string; amountCents: number }[];
            const remainder = draft.totalCents - Number(values.householdCents ?? 0) - rows.reduce((sum, row) => sum + row.amountCents, 0);
            return <div className="flex flex-col gap-3">
              <input type="hidden" name={name} value={JSON.stringify(rows)} />
              {rows.map((row, index) => <div key={`${index}:${row.projectId}`} className="flex flex-wrap gap-2 rounded-xl border p-3">
                <EntityPicker items={projects.filter((project) => !rows.some((other, i) => i !== index && other.projectId === project.id)).map((project) => ({ id: project.id, label: project.name }))}
                  value={row.projectId || null} disabled={disabled} onChange={(id) => setValue(rows.map((other, i) => i === index ? { ...other, projectId: id ?? "" } : other))} className="min-w-0 flex-1" />
                <MoneyInput aria-label={t("allocation.projectAmount")} defaultValueCents={row.amountCents} disabled={disabled} className="w-32" onValueChange={(amount) => setValue(rows.map((other, i) => i === index ? { ...other, amountCents: amount ?? 0 } : other))} />
                <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={t("allocation.remove")} onClick={() => setValue(rows.filter((_, i) => i !== index))}><XIcon /></Button>
              </div>)}
              <Button type="button" variant="outline" disabled={disabled || rows.length >= projects.length} onClick={() => setValue([...rows, { projectId: projects.find((project) => !rows.some((row) => row.projectId === project.id))?.id ?? "", amountCents: 0 }])}><PlusIcon />{t("allocation.add")}</Button>
              <p role="status" className={remainder < 0 ? "text-sm font-medium text-danger" : "text-sm text-muted-foreground"}>{t(remainder < 0 ? "allocation.over" : "allocation.remaining", { amount: money(Math.abs(remainder)) })}</p>
            </div>;
          } },
        ]}
        onSuccess={() => { setRefresh((value) => value + 1); void revalidator.revalidate(); }}
      />
    </CardHeader>
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between gap-3"><dt>{t("allocation.total")}</dt><dd className="font-semibold tabular-nums">{money(data.totalCents)}</dd></div>
      {data.projects.map((project, index) => <div key={project.projectId ?? index} className="flex justify-between gap-3"><dt>{project.projectId ? <Link to={`/projects/${encodeURIComponent(project.projectId)}`} className="hover:underline">{project.name}</Link> : t("allocation.deletedProject", { name: project.name })}</dt><dd className="tabular-nums">{money(project.amountCents)}</dd></div>)}
      <div className="flex justify-between gap-3"><dt>{t("allocation.household")}</dt><dd className="tabular-nums">{money(data.householdCents)}</dd></div>
      {data.unallocatedCents !== 0 && <div className="flex justify-between gap-3 text-warning"><dt>{t("allocation.unallocated")}</dt><dd className="tabular-nums">{money(data.unallocatedCents)}</dd></div>}
    </dl>
  </Card>;
}
