import * as React from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AddShoppingItemForm, type AddShoppingItemInput } from "./add-shopping-item-form";

type Props = Omit<React.ComponentProps<typeof AddShoppingItemForm>, "layout" | "onCancel" | "autoFocus" | "className"> & {
  defaultOpen?: boolean;
  /** Optional primary-action trigger so shopping screens can reuse SplitAction. */
  trigger?: React.ReactElement;
};

/** One add action for both shopping views; existing products are the first choice in the dialog. */
export function AddShoppingItemDialog({ defaultOpen = false, trigger, onAdd, ...props }: Props) {
  const { t } = useTranslation("shopping");
  const [open, setOpen] = React.useState(defaultOpen);
  const [saving, setSaving] = React.useState(false);

  async function add(input: AddShoppingItemInput) {
    setSaving(true);
    try {
      await onAdd(input);
      toast.success(t("add.added"));
      setOpen(false);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
      <DialogTrigger asChild>{trigger ?? <Button><PlusIcon />{t("actions.addItem")}</Button>}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("actions.addItem")}</DialogTitle>
          <DialogDescription>{t("add.description")}</DialogDescription>
        </DialogHeader>
        <AddShoppingItemForm {...props} onAdd={add} layout="dialog" onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
