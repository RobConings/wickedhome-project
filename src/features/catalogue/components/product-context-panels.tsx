import { FolderKanbanIcon, ListChecksIcon, ReceiptTextIcon, ShoppingCartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardTitle } from "@/components/shared/card";
import { RelatedRecordCards } from "@/components/shared/related-record-cards";
import { RecordLink } from "@/components/shared/record-link";
import { RecordImage } from "@/components/shared/record-image";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageGrid } from "@/components/layout/page-grid";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchProductContext } from "../data/catalogue-requests";
import type { ProductContext } from "../types/product-context";

export function ProductContextPanels({ productId, initial }: { productId: string; initial?: ProductContext }) {
  const { t } = useTranslation("catalogue");
  const resource = useAsyncResource(`product-context:${productId}`, () => fetchProductContext(productId), { initial });
  if (resource.error) return <ErrorState title={t("loadError")} action={<Button onClick={resource.refresh}>{t("retry")}</Button>} />;
  if (!resource.data) return <Skeleton className="h-48" />;
  const data = resource.data;
  return <div className="flex flex-col gap-5">
    <RelatedRecordCards label={t("related")} items={[
      { id: "needs", label: t("needs"), value: data.needs.length, to: "#product-needs", icon: ShoppingCartIcon, accent: "shopping" },
      { id: "tasks", label: t("tasks"), value: data.tasks.length, to: "#product-tasks", icon: ListChecksIcon, accent: "tasks" },
      { id: "projects", label: t("projects"), value: data.projects.length, to: "#product-projects", icon: FolderKanbanIcon, accent: "finance" },
      { id: "purchases", label: t("purchases"), to: `/purchases?productId=${encodeURIComponent(data.productId)}`, icon: ReceiptTextIcon, accent: "finance" },
    ]} />
    <PageGrid columns="3">
      <Card id="product-needs" className="scroll-mt-20"><CardTitle>{t("needs")}</CardTitle>{data.needs.length ? <ul>{data.needs.map((need) => <li key={need.id}><RecordLink className="flex min-h-11 items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-accent" to={`/shopping?productId=${encodeURIComponent(data.productId)}`}><span>{need.name}</span><span className="shrink-0 text-muted-foreground">{need.quantity} {need.unit}</span></RecordLink></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("noNeeds")}</p>}</Card>
      <Card id="product-tasks" className="scroll-mt-20"><CardTitle>{t("tasks")}</CardTitle>{data.tasks.length ? <ul>{data.tasks.map((task) => <li key={task.id}><RecordLink className="flex min-h-11 items-center rounded-lg p-2 text-sm hover:bg-accent" to={`/tasks/${encodeURIComponent(task.id)}`}>{task.name}</RecordLink></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("noTasks")}</p>}</Card>
      <Card id="product-projects" className="scroll-mt-20"><CardTitle>{t("projects")}</CardTitle>{data.projects.length ? <ul>{data.projects.map((project) => <li key={project.id}><RecordLink className="flex min-h-11 items-center gap-2 rounded-lg py-2 text-sm hover:bg-accent" to={`/projects/${encodeURIComponent(project.id)}`}><RecordImage src={project.imageUrl} shape="avatar" fallback={<FolderKanbanIcon className="size-5" />} />{project.name}</RecordLink></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("noProjects")}</p>}</Card>
    </PageGrid>
  </div>;
}
