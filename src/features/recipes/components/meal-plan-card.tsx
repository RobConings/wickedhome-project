import * as React from "react";
import { CheckIcon, CookingPotIcon, ListOrderedIcon, PlayIcon, ShoppingCartIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/shared/card";
import { RecipeCardCover, RecipeCardStat, RecipeCardTitle } from "./recipe-card-content";
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
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const location = useLocation();
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
    fetcher.submit({ intent, entryId: entry.id, recordOrigin: `${location.pathname}${location.search}${location.hash}`, ...extra }, { method: "post", action });

  return (
    <Card className={cn("h-full gap-0 overflow-hidden p-0", cooked && "opacity-75")} tone={status === "cooking" ? "featured" : "default"}>
      <RecipeCardCover src={coverUrl} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <RecipeCardTitle name={entry.recipeName} to={recipePath(entry.recipeId)} />
        <div className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-2">
          <RecipeCardStat icon={UsersIcon} label={t("facts.servings", { count: entry.servings })}>{entry.servings}</RecipeCardStat>
          {!cooked && <RecipeCardStat icon={ShoppingCartIcon} label={t("toCook.openItems", { count: entry.openItemCount })}>{entry.openItemCount}</RecipeCardStat>}
          {status === "cooking" ? <RecipeCardStat icon={CookingPotIcon} label={entry.stepCount > 0 ? t("toCook.cookingStep", { step: entry.currentStep + 1, total: entry.stepCount }) : t("toCook.cooking")}>
            {entry.stepCount > 0 ? `${entry.currentStep + 1}/${entry.stepCount}` : "—"}
          </RecipeCardStat> : entry.stepCount > 0 && <RecipeCardStat icon={ListOrderedIcon} label={t("facts.steps", { count: entry.stepCount })}>{entry.stepCount}</RecipeCardStat>}
          {cooked && <RecipeCardStat icon={CheckIcon} label={entry.cookedAt ? t("toCook.madeOn", { date: formatDate(entry.cookedAt, locale) }) : t("toCook.made")}>
            {entry.cookedAt ? <time dateTime={entry.cookedAt}>{formatDate(entry.cookedAt, locale)}</time> : "✓"}
          </RecipeCardStat>}
        </div>
        {entry.addedByName && !cooked && <span className="sr-only">{t("toCook.addedBy", { name: entry.addedByName })}</span>}
        {(!cooked || canManage) && <div className="mt-auto flex flex-col gap-2 pt-2" data-slot="recipe-card-actions">
          {!cooked && (
            <Button fullOnMobile className="w-full" onClick={() => void submit("start")} loading={pendingIntent === "start"} disabled={fetcher.state !== "idle"}>
              <PlayIcon />
              {status === "cooking" ? t("toCook.continue") : t("toCook.start")}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {!cooked && (
              <Button variant="outline" fullOnMobile className={cn("w-full min-w-0 gap-1 px-2 text-xs", !canManage && "col-span-2")} onClick={() => void submit("done")} disabled={fetcher.state !== "idle"}>
                <CheckIcon />
                {t("toCook.done")}
              </Button>
            )}
            {canManage && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" fullOnMobile className={cn("w-full min-w-0 gap-1 px-2 text-xs text-destructive hover:text-destructive", cooked && "col-span-2")} disabled={fetcher.state !== "idle"}>
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
                cancelLabel={tCommon("actions.cancel")}
                destructive
                onConfirm={() =>
                  submit("remove-entry", {
                    removeItems: removeItems && !cooked ? "1" : "",
                  })
                }
              />
            )}
          </div>
        </div>}
      </div>
    </Card>
  );
}
