import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import { useState } from "react";
import { FolderKanbanIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityPicker } from "@/components/shared/entity-picker";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { fetchProjects } from "@/features/projects";
import { useAsyncResource } from "@/lib/use-async-resource";
import { goodsAllocationFormSchema, type GoodsAllocationView } from "../types/goods-allocation";

/** Goods purpose is separate from the linked expense's cost allocation and actual stock use. */
export function GoodsAllocationDialog({ allocation, initialProjects }: { allocation: GoodsAllocationView; initialProjects?: { id: string; name: string }[] }) {
  const { t } = useTranslation("purchases");
  const [editing, setEditing] = useState<GoodsAllocationView | null>(null);
  const projects = useAsyncResource("goods-project-options", () => fetchProjects().then((value) => value.projects.map((project) => ({ id: project.id, name: project.name }))), { initial: initialProjects, enabled: Boolean(editing) });
  const draft = editing ?? allocation;
  return <GeneralFormDialog trigger={<Button variant="outline" size="sm" className="min-h-11"><FolderKanbanIcon />{t("allocation.edit")}</Button>}
    title={t("allocation.title")} description={t("allocation.description")}
    onOpenChange={(open) => setEditing(open ? allocation : null)} intent="allocate-goods"
    schema={goodsAllocationFormSchema} hiddenFields={{ acquisitionId: allocation.acquisitionId, revision: draft.revision }}
    defaultValues={{ householdQuantity: draft.householdQuantity, projects: draft.projects.map((project) => ({ projectId: project.projectId ?? "", quantity: project.quantity })) }}
    fields={[
      { name: "householdQuantity", type: "number", label: t("allocation.household"), description: draft.unit ?? undefined, min: 0, step: 0.001, max: draft.quantity },
      { name: "projects", type: "custom", label: t("allocation.projects"), render: ({ name, value, setValue, values, disabled }) => {
        const rows = (Array.isArray(value) ? value : []) as { projectId: string; quantity: number }[];
        const remainder = Math.round((draft.quantity - Number(values.householdQuantity ?? 0) - rows.reduce((sum, row) => sum + row.quantity, 0)) * 1000) / 1000;
        return <Stack gap="3"><input type="hidden" name={name} value={JSON.stringify(rows)} />
          {projects.error && <Text size="sm" tone="danger" role="alert">{t("allocation.loadError")} <Button type="button" variant="link" onClick={projects.refresh}>{t("allocation.retry")}</Button></Text>}
          {rows.map((row, index) => <Inline gap="sm" align="stretch" wrap key={`${index}:${row.projectId}`} className="rounded-xl border p-3">
            <EntityPicker items={(projects.data ?? []).filter((project) => !rows.some((other, i) => i !== index && other.projectId === project.id)).map((project) => ({ id: project.id, label: project.name }))}
              value={row.projectId || null} loading={projects.loading} disabled={disabled} className="min-w-0 flex-1" onChange={(id) => setValue(rows.map((other, i) => i === index ? { ...other, projectId: id ?? "" } : other))} />
            <Input aria-label={t("allocation.quantity")} className="w-28" type="number" min={0.001} max={draft.quantity} step={0.001} disabled={disabled} value={row.quantity || ""} onChange={(event) => setValue(rows.map((other, i) => i === index ? { ...other, quantity: Number(event.target.value) } : other))} />
            <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={t("allocation.remove")} onClick={() => setValue(rows.filter((_, i) => i !== index))}><XIcon /></Button>
          </Inline>)}
          <Button type="button" variant="outline" disabled={disabled || projects.loading || projects.error || rows.length >= (projects.data?.length ?? 0)} onClick={() => setValue([...rows, { projectId: projects.data?.find((project) => !rows.some((row) => row.projectId === project.id))?.id ?? "", quantity: 0 }])}><PlusIcon />{t("allocation.add")}</Button>
          <Text role="status" className={remainder < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{t(remainder < 0 ? "allocation.over" : "allocation.remaining", { quantity: Math.abs(remainder), unit: draft.unit ?? "" })}</Text>
        </Stack>;
      } },
    ]} />;
}
