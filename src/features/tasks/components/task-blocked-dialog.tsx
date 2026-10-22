import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import type { Task } from "../types/tasks";

type TaskBlockedDialogProps = {
  task: Pick<Task, "title" | "waitingFor">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Completes anyway; return the fetcher's promise to keep the dialog busy until it's done. */
  onConfirm: () => Promise<unknown> | void;
};

/** "Still waiting for … Complete anyway?" when a task with open blockers is ticked off. */
export function TaskBlockedDialog({ task, open, onOpenChange, onConfirm }: TaskBlockedDialogProps) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const [busy, setBusy] = React.useState(false);

  async function confirm(event: React.MouseEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("blocked.title", { title: task.title })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("blocked.description", { titles: task.waitingFor.map((other) => other.title).join(", ") || "…" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{tCommon("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={(event) => void confirm(event)} disabled={busy}>
            {busy && <Spinner />}
            {t("blocked.completeAnyway")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
