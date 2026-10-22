import * as React from "react";
import { PencilIcon, PlusIcon, TagsIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { recipeCategoryInputSchema, type RecipeCategory } from "../types/recipes";

/** Categories are shared by the household; deleting a category keeps all its recipes. */
export function RecipeCategoriesDialog({ categories }: { categories: RecipeCategory[] }) {
  const { t, i18n } = useTranslation("recipes");
  const [editing, setEditing] = React.useState<RecipeCategory | "new" | null>(null);
  const category = editing && editing !== "new" ? editing : null;
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline"><TagsIcon />{t("categories.manage")}</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("categories.manage")}</DialogTitle>
            <DialogDescription>{t("categories.description")}</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setEditing("new")} className="self-start"><PlusIcon />{t("categories.add")}</Button>
          {categories.length ? (
            <ul className="divide-y">
              {categories.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0 break-words font-medium">{item.name}<span className="ml-2 text-sm font-normal text-muted-foreground">{item.recipeCount}</span></span>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(item)} aria-label={t("categories.editLabel", { name: item.name })}><PencilIcon /></Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t("categories.empty")}</p>}
        </DialogContent>
      </Dialog>
      <GeneralFormDialog<RecipeActionResult>
        key={category?.id ?? "new"}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={t(category ? "categories.edit" : "categories.add")}
        description={t("categories.description")}
        schema={recipeCategoryInputSchema}
        fields={[{ name: "name", type: "text", label: t("fields.name"), placeholder: t("categories.namePlaceholder"), autoFocus: true }]}
        defaultValues={{ name: category?.name ?? "" }}
        hiddenFields={{ id: category?.id }}
        intent={category ? "update-category" : "create-category"}
        successMessage={t("categories.saved")}
        translateError={(message) => i18n.exists(`recipes:errors.${message}`) ? t(`errors.${message}`) : message}
        secondaryAction={category ? {
          label: t("categories.delete"), icon: <Trash2Icon />, destructive: true, intent: "delete-category", data: { id: category.id },
          confirm: { title: t("categories.deleteTitle", { name: category.name }), description: t("categories.deleteDescription") },
          successMessage: t("categories.deleted"),
        } : undefined}
      />
    </>
  );
}
