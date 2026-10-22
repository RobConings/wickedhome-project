import * as React from "react";
import { ReceiptIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProjectActionResult } from "../data/projects-loaders";
import type { ProjectMaterial } from "../types/projects";
import type { RenderLogExpense } from "./project-expenses-section";
import { useProjectText } from "./use-project-text";

type ProjectPurchasesNoteProps = {
  projectId: string;
  projectName: string;
  materials: ProjectMaterial[];
  renderLogExpense?: RenderLogExpense;
};

/**
 * Bought materials that aren't an expense yet: "Log as expense" opens "Log an expense" with their total, and
 * links them to the new expense, so the budget counts the receipt once.
 */
export function ProjectPurchasesNote({ projectId, projectName, materials, renderLogExpense }: ProjectPurchasesNoteProps) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const fetcher = useFetcher<ProjectActionResult>();
  const unlogged = materials.filter((material) => material.bought && material.expenseId === null);
  const totalCents = unlogged.reduce((sum, material) => sum + (material.lineCents ?? 0), 0);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  if (unlogged.length === 0 || !renderLogExpense) return null;
  const itemIds = unlogged.map((material) => material.id).join(",");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">
        {t("purchases.unlogged", { count: unlogged.length, amount: text.money(totalCents) })}
      </span>
      {renderLogExpense({
        amountCents: totalCents > 0 ? totalCents : undefined,
        payee: projectName,
        onSaved: (expenseId) => void fetcher.submit({ intent: "purchase", id: projectId, expenseId, itemIds }, { method: "post" }),
        trigger: (
          <Button variant="outline" size="sm" loading={fetcher.state !== "idle"}>
            <ReceiptIcon />
            {t("purchases.log")}
          </Button>
        ),
      })}
    </div>
  );
}
