import * as React from "react";
import { ArrowLeftIcon, CheckIcon, ChefHatIcon, ChevronUpIcon, MonitorSmartphoneIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PageContainer } from "../components/page-container";
import { PageGrid } from "../components/page-grid";
import { Stack } from "../components/stack";
import { Card, CardTitle } from "../components/card";
import { InlineAlert } from "../components/inline-alert";
import { PageHeader } from "../components/page-header";
import type { Product } from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { formatDate } from "@/types/date-format";
import { CookingDoneDialog } from "../components/cooking-done-dialog";
import { CookingIngredientsPanel } from "../components/cooking-ingredients-panel";
import { CookingStepCard } from "../components/cooking-step-card";
import { useWakeLock } from "../components/use-wake-lock";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { recipePath, usedCount, type CookingState } from "../types/recipes";

type CookingScreenProps = {
  state: CookingState;
  /** For "+ Ingredient". */
  products: Product[];
  /** Owners and adults may save an extra ingredient to the recipe. */
  canSaveToRecipe: boolean;
  /** Reloading after a tap (the route's revalidation): a small "Saving…" in the header, never a faded step. */
  pending?: boolean;
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * The cooking view, made for a phone on the kitchen counter: one large step at a time (Previous / Next or
 * swipe, a timer when the step has one), the screen stays on, and the ingredients in a tray (a bottom sheet on
 * phones, a side column on wide screens) with a big "Used" per ingredient. Nothing is taken from stock unless
 * tapped; every tap can be undone. "Done cooking" only marks the meal made.
 */
export function CookingScreen({ state, products, canSaveToRecipe, pending = false, initialSelections }: CookingScreenProps) {
  const { t } = useTranslation("recipes");
  const locale = currentLocale();
  const { entry, recipe } = state;
  const cooked = entry.status === "cooked";
  const [step, setStep] = React.useState(Math.min(entry.currentStep, Math.max(0, recipe.steps.length - 1)));
  const stepFetcher = useFetcher<RecipeActionResult>({
    key: `cook-step-${entry.id}`,
  });
  const undoFetcher = useFetcher<RecipeActionResult>({
    key: `cook-undo-${entry.id}`,
  });
  const wakeLock = useWakeLock(!cooked);
  const all = [...state.ingredients, ...state.extras];
  const stepText = recipe.steps[step]?.text ?? null;

  React.useEffect(() => {
    if (undoFetcher.state !== "idle" || !undoFetcher.data) return;
    if (undoFetcher.data.ok) toast(t("cooking.undone"));
    else if (undoFetcher.data.formError) toast.error(undoFetcher.data.formError);
  }, [undoFetcher.state, undoFetcher.data, t]);

  const changeStep = (next: number) => {
    setStep(next);
    // Remembered for other devices and the assistant; the page doesn't reload for it.
    void stepFetcher.submit({ intent: "step", entryId: entry.id, step: String(next) }, { method: "post" });
  };
  const undo = React.useCallback(
    (usageId: string) => void undoFetcher.submit({ intent: "undo", entryId: entry.id, usageId }, { method: "post" }),
    [undoFetcher, entry.id],
  );

  const panel = (
    <CookingIngredientsPanel
      entryId={entry.id}
      ingredients={state.ingredients}
      extras={state.extras}
      stepText={stepText}
      products={products}
      canSaveToRecipe={canSaveToRecipe}
      disabled={cooked}
      onUndo={undo}
      initialSelections={initialSelections}
    />
  );

  const doneButton = !cooked && (
    <CookingDoneDialog
      entryId={entry.id}
      recipeName={recipe.name}
      usages={state.usages}
      trigger={
        <Button size="lg" className="h-12">
          <CheckIcon />
          {t("cooking.done")}
        </Button>
      }
    />
  );
  const trayLabel = t("cooking.tray", {
    used: usedCount(all),
    total: all.length,
  });

  return (
    <PageContainer>
      <Stack gap="md">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground">
          <Link to={recipePath(recipe.id)}>
            <ArrowLeftIcon />
            {t("cooking.backToRecipe")}
          </Link>
        </Button>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <ChefHatIcon className="size-7 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 break-words">{recipe.name}</span>
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <UsersIcon className="size-3.5" aria-hidden="true" />
                {t("facts.servings", { count: entry.servings })}
              </span>
              {pending && (
                <span className="flex items-center gap-1" role="status">
                  <Spinner className="size-3.5" />
                  {t("cooking.saving")}
                </span>
              )}
              {wakeLock === "on" && (
                <span className="flex items-center gap-1">
                  <MonitorSmartphoneIcon className="size-3.5" aria-hidden="true" />
                  {t("cooking.screenOn")}
                </span>
              )}
            </span>
          }
          actions={doneButton}
        />
      </Stack>

      {cooked && (
        <InlineAlert tone="success">
          <span className="flex flex-col gap-2">
            {entry.cookedAt
              ? t("cooking.madeOn", {
                  date: formatDate(entry.cookedAt, locale),
                })
              : t("toCook.made")}
            <Button asChild variant="outline" fullOnMobile className="self-start">
              <Link to="/recipes">{t("cooking.backToList")}</Link>
            </Button>
          </span>
        </InlineAlert>
      )}

      <PageGrid columns="main-sidebar" className="items-start">
        <CookingStepCard steps={recipe.steps} current={step} onChange={changeStep} finish={doneButton || undefined} />
        {/* Wide screens: the ingredients next to the step. */}
        <Card className="hidden gap-3 p-4 lg:flex">
          <CardTitle>{t("cooking.ingredients")}</CardTitle>
          {panel}
        </Card>
      </PageGrid>

      {/* Phones and tablets: a tray at the bottom opens the ingredients as a sheet. Room on the right for the Ask button. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pt-3 pr-[calc(max(1rem,env(safe-area-inset-right))+3.5rem)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur lg:hidden print:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="lg" variant="secondary" className="h-12 w-full justify-between">
              <span className="truncate">{trayLabel}</span>
              <ChevronUpIcon aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <SheetHeader>
              <SheetTitle>{t("cooking.ingredients")}</SheetTitle>
              <SheetDescription>{trayLabel}</SheetDescription>
            </SheetHeader>
            <div className="px-4">{panel}</div>
          </SheetContent>
        </Sheet>
      </div>
    </PageContainer>
  );
}
