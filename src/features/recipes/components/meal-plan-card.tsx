import * as React from "react";
import { CheckIcon, ChefHatIcon, CookingPotIcon, PlayIcon, ShoppingCartIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate } from "@/types/date-format";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { recipeCoverUrl } from "../data/recipe-cover-url";
import { recipePath, type MealPlanEntry } from "../types/recipes";

type MealPlanCardProps = {
  entry: MealPlanEntry;
  /** Owners and adults take meals off the list; everyone may cook and mark them done. */
  canManage: boolean;
  /** Route to post to (default: the current route). */
  action?: string;
};

/**
 * A meal on "To cook": photo, name, for how many, whether it's being cooked (and at which step) and what's still
 * on the shopping list for it. "Start cooking" / "Continue" opens the cooking view; "Done" marks it made right
 * away (optimistic); removing it can take its open shopping items along.
 */
export function MealPlanCard({ entry, canManage, action }: MealPlanCardProps) {
  const { t } = useTranslation("recipes");
  const locale = currentLocale();
  const fetcher = useFetcher<RecipeActionResult>();
  const [removeItems, setRemoveItems] = React.useState(true);
  const pendingIntent = fetcher.formData?.get("intent");
  const status = pendingIntent === "done" ? "cooked" : entry.status;
  const cooked = status === "cooked";
  const coverUrl = recipeCoverUrl(entry);

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.formError) toast.error(fetcher.data.formError);
    else if (fetcher.data.ok && fetcher.data.intent === "done") toast.success(t("toCook.markedDone", { name: entry.recipeName }));
    else if (fetcher.data.ok && fetcher.data.intent === "remove-entry") toast.success(t("toCook.removed", { name: entry.recipeName }));
  }, [fetcher.state, fetcher.data, t, entry.recipeName]);

  const submit = (intent: string, extra: Record<string, string> = {}) =>
    fetcher.submit({ intent, entryId: entry.id, ...extra }, { method: "post", action });

  return (
    <Card className={cn("gap-3 p-4", cooked && "opacity-75")} tone={status === "cooking" ? "featured" : "default"}>
      <div className="flex items-start gap-3">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" loading="lazy" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <ChefHatIcon className="size-6" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link to={recipePath(entry.recipeId)} className="font-medium break-words underline-offset-4 hover:underline">
            {entry.recipeName}
          </Link>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden="true" />
              {t("facts.servings", { count: entry.servings })}
            </span>
            {entry.openItemCount > 0 && !cooked && (
              <span className="flex items-center gap-1">
                <ShoppingCartIcon className="size-3.5" aria-hidden="true" />
                {t("toCook.openItems", { count: entry.openItemCount })}
              </span>
            )}
            {entry.addedByName && !cooked && <span>{t("toCook.addedBy", { name: entry.addedByName })}</span>}
          </span>
          <span className="flex flex-wrap gap-1.5 pt-0.5">
            {status === "cooking" && (
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                <CookingPotIcon aria-hidden="true" />
                {entry.stepCount > 0
                  ? t("toCook.cookingStep", {
                      step: entry.currentStep + 1,
                      total: entry.stepCount,
                    })
                  : t("toCook.cooking")}
              </Badge>
            )}
            {cooked && (
              <Badge variant="secondary" className="gap-1">
                <CheckIcon aria-hidden="true" />
                {entry.cookedAt
                  ? t("toCook.madeOn", {
                      date: formatDate(entry.cookedAt, locale),
                    })
                  : t("toCook.made")}
              </Badge>
            )}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!cooked && (
          <Button fullOnMobile onClick={() => void submit("start")} loading={pendingIntent === "start"} disabled={fetcher.state !== "idle"}>
            <PlayIcon />
            {status === "cooking" ? t("toCook.continue") : t("toCook.start")}
          </Button>
        )}
        {!cooked && (
          <Button variant="outline" fullOnMobile onClick={() => void submit("done")} disabled={fetcher.state !== "idle"}>
            <CheckIcon />
            {t("toCook.done")}
          </Button>
        )}
        {canManage && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" fullOnMobile className="text-destructive hover:text-destructive sm:ml-auto" disabled={fetcher.state !== "idle"}>
                <Trash2Icon />
                {cooked ? t("toCook.clear") : t("toCook.remove")}
              </Button>
            }
            title={t("toCook.removeTitle", { name: entry.recipeName })}
            description={
              <span className="flex flex-col gap-3">
                <span>{t("toCook.removeDescription")}</span>
                {entry.openItemCount > 0 && !cooked && (
                  <label className="flex min-h-10 items-center gap-2 text-foreground">
                    <Switch checked={removeItems} onCheckedChange={setRemoveItems} />
                    {t("toCook.removeItems", { count: entry.openItemCount })}
                  </label>
                )}
              </span>
            }
            confirmLabel={cooked ? t("toCook.clear") : t("toCook.remove")}
            destructive
            onConfirm={() =>
              submit("remove-entry", {
                removeItems: removeItems && !cooked ? "1" : "",
              })
            }
          />
        )}
      </div>
    </Card>
  );
}
