import * as React from "react";
import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatQuantity } from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { usageSummary, type CookUsage } from "../types/recipes";

type CookingDoneDialogProps = {
  entryId: string;
  recipeName: string;
  usages: CookUsage[];
  trigger: React.ReactElement;
  action?: string;
};

/**
 * "Done cooking": shows what was used (nothing more is taken from stock: every tap already was) and marks the
 * meal made.
 */
export function CookingDoneDialog({ entryId, recipeName, usages, trigger, action }: CookingDoneDialogProps) {
  const { t } = useTranslation("recipes");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const [open, setOpen] = React.useState(false);
  const fetcher = useFetcher<RecipeActionResult>();
  const busy = fetcher.state !== "idle";
  const summary = usageSummary(usages);

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    // Once made, the screen drops the "Done cooking" button and this dialog with it.
    if (fetcher.data.ok) toast.success(t("cooking.doneToast", { name: recipeName }));
    else if (fetcher.data.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data, recipeName, t]);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cooking.doneTitle", { name: recipeName })}</DialogTitle>
          <DialogDescription>{t("cooking.doneDescription")}</DialogDescription>
        </DialogHeader>
        {summary.length ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {summary.map((line) => (
              <li key={`${line.name}-${line.unit}`} className="flex items-baseline justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 break-words">{line.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatQuantity(line.quantity, locale)}
                  {line.unit ? ` ${line.unit}` : ""}
                  {line.recipeQuantity && ` (${formatQuantity(line.recipeQuantity.amount, locale)} ${line.recipeQuantity.unit})`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("cooking.nothingUsed")}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {tCommon("actions.cancel")}
          </Button>
          <Button onClick={() => void fetcher.submit({ intent: "done", entryId }, { method: "post", action })} loading={busy}>
            <CheckIcon />
            {t("cooking.markMade")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
