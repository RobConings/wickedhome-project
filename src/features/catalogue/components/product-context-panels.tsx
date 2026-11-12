import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { BookOpenIcon, FolderKanbanIcon, ListChecksIcon, ReceiptTextIcon, ShoppingCartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardTitle } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";
import { RecordLink } from "@/components/shared/record-link";
import { RecordImage } from "@/components/shared/record-image";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageGrid } from "@/components/layout/page-grid";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchProductContext } from "../data/catalogue-requests";
import type { ProductContext } from "../types/product-context";

/**
 * The product's Overview contains navigable, owner-filtered records rather than a second
 * row of counters repeating the cards below. This read view never owns their writes.
 */
export function ProductContextPanels({ productId, initial }: { productId: string; initial?: ProductContext }) {
  const { t } = useTranslation("catalogue");
  const resource = useAsyncResource(`product-context:${productId}`, () => fetchProductContext(productId), { initial });
  if (resource.error) return <ErrorState title={t("loadError")} action={<Button onClick={resource.refresh}>{t("retry")}</Button>} />;
  if (!resource.data) return <Skeleton className="h-48" />;
  const data = resource.data;
  const productFilter = encodeURIComponent(data.productId);

  return (
    <PageGrid columns="3">
      <Card id="product-needs" className="scroll-mt-20">
        <Inline gap="sm" align="center"><IconChip icon={ShoppingCartIcon} tone="shopping" size="sm" /><CardTitle>{t("needs")} ({data.needs.length})</CardTitle></Inline>
        {data.needs.length ? <>
          <ul className="divide-y">{data.needs.slice(0, 5).map((need) => (
            <li key={need.id}>
              <RecordLink className="flex min-h-11 items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-accent"
                to={`/shopping/items/${encodeURIComponent(need.id)}`}>
                <span>{need.name}</span>
                <span className="shrink-0 text-muted-foreground">{need.quantity} {need.unit}</span>
              </RecordLink>
            </li>
          ))}</ul>
          {data.needs.length > 5 && <RecordLink to={`/shopping?productId=${productFilter}`}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-section underline-offset-4 hover:underline">
            {t("viewAllNeeds", { count: data.needs.length })}
          </RecordLink>}
        </> : <Text size="sm" tone="muted">{t("noNeeds")}</Text>}
      </Card>
      <Card id="product-tasks" className="scroll-mt-20">
        <Inline gap="sm" align="center"><IconChip icon={ListChecksIcon} tone="tasks" size="sm" /><CardTitle>{t("tasks")} ({data.tasks.length})</CardTitle></Inline>
        {data.tasks.length ? <ul className="divide-y">{data.tasks.map((task) => (
          <li key={task.id}><RecordLink className="flex min-h-11 items-center rounded-lg p-2 text-sm hover:bg-accent"
            to={`/tasks/${encodeURIComponent(task.id)}`}>{task.name}</RecordLink></li>
        ))}</ul> : <Text size="sm" tone="muted">{t("noTasks")}</Text>}
      </Card>
      <Card id="product-projects" className="scroll-mt-20">
        <Inline gap="sm" align="center"><IconChip icon={FolderKanbanIcon} tone="finance" size="sm" /><CardTitle>{t("projects")} ({data.projects.length})</CardTitle></Inline>
        {data.projects.length ? <ul className="divide-y">{data.projects.map((project) => (
          <li key={project.id}><RecordLink className="flex min-h-11 items-center gap-2 rounded-lg py-2 text-sm hover:bg-accent"
            to={`/projects/${encodeURIComponent(project.id)}`}><RecordImage src={project.imageUrl} shape="avatar"
            fallback={<FolderKanbanIcon className="size-5" />} />{project.name}</RecordLink></li>
        ))}</ul> : <Text size="sm" tone="muted">{t("noProjects")}</Text>}
      </Card>
      <Card id="product-purchases" className="scroll-mt-20">
        <Inline gap="sm" align="center"><IconChip icon={ReceiptTextIcon} tone="finance" size="sm" /><CardTitle>{t("purchases")}</CardTitle></Inline>
        <RecordLink className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium underline-offset-4 hover:underline"
          to={`/purchases?productId=${productFilter}`}>{t("viewPurchases")}</RecordLink>
      </Card>
      <Card id="product-recipes" className="scroll-mt-20">
        <Inline gap="sm" align="center"><IconChip icon={BookOpenIcon} tone="home" size="sm" /><CardTitle>{t("recipes")} ({data.recipes.length})</CardTitle></Inline>
        {data.recipes.length ? <>
          <ul className="divide-y">{data.recipes.slice(0, 5).map((recipe) => (
            <li key={recipe.id}><RecordLink to={`/recipes/${encodeURIComponent(recipe.id)}`} className="flex min-h-11 items-center gap-3 rounded-lg py-2 text-sm hover:bg-accent">
              <RecordImage src={recipe.imageUrl} shape="avatar" fallback={<BookOpenIcon className="size-5" />} className="size-12" /><span className="min-w-0 break-words">{recipe.name}</span>
            </RecordLink></li>
          ))}</ul>
          {data.recipes.length > 5 && <RecordLink to={`/recipes?tab=all&productId=${productFilter}`}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-section underline-offset-4 hover:underline">
            {t("viewAllRecipes", { count: data.recipes.length })}
          </RecordLink>}
        </> : <Text size="sm" tone="muted">{t("noRecipes")}</Text>}
      </Card>
    </PageGrid>
  );
}
