import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "react-i18next";

type ConfirmDialogProps = {
  /** The element that opens the dialog, usually a Button. */
  trigger: React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  /** "Cancel" (common) by default. */
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /**
   * Return the promise of the work (e.g. `() => fetcher.submit(...)`, which resolves when the action and
   * reload are done): the dialog then stays open with a busy confirm button until it settles.
   */
  onConfirm: () => void | Promise<unknown>;
};

/** "Are you sure?" step before an irreversible action. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const confirm = async (event: React.MouseEvent) => {
    const result = onConfirm();
    if (!(result instanceof Promise)) return;
    event.preventDefault();
    setBusy(true);
    try {
      await result;
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel ?? t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={confirm}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type DeleteConfirmDialogProps = Omit<ConfirmDialogProps, "destructive" | "confirmLabel"> & {
  /** "Delete" (common) by default. */
  confirmLabel?: string;
};

/** `ConfirmDialog` for deletes: destructive, with "Delete" / "Cancel" unless told otherwise. */
export function DeleteConfirmDialog({ confirmLabel, ...props }: DeleteConfirmDialogProps) {
  const { t } = useTranslation();
  return <ConfirmDialog {...props} confirmLabel={confirmLabel ?? t("actions.delete")} destructive />;
}
