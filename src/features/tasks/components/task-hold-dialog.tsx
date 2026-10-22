import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Stack } from "@/components/layout/stack";
import { FormField } from "@/components/shared/form-field";
import type { Task } from "../types/tasks";

type TaskHoldDialogProps = {
  task: Pick<Task, "id" | "title" | "hold">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the hold; return the fetcher's promise so the dialog stays busy until it's done. */
  onHold: (reason: string) => Promise<unknown> | void;
};

/** "Put on hold" with an optional reason ("Invoice looks wrong; recalculate first"). The due date stays. */
export function TaskHoldDialog({ task, open, onOpenChange, onHold }: TaskHoldDialogProps) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const [reason, setReason] = React.useState(task.hold?.reason ?? "");
  const [busy, setBusy] = React.useState(false);
  const id = `task-hold-${task.id}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onHold(reason.trim());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <fieldset disabled={busy} className="min-w-0">
            <Stack gap="lg">
              <DialogHeader>
                <DialogTitle>{t("hold.title", { title: task.title })}</DialogTitle>
                <DialogDescription>{t("hold.description")}</DialogDescription>
              </DialogHeader>
              <FormField label={t("hold.reason")} htmlFor={id} optionalLabel={tCommon("form.optional")}>
                <Textarea
                  id={id}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder={t("hold.reasonPlaceholder")}
                />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {tCommon("actions.cancel")}
                </Button>
                <Button type="submit" loading={busy}>
                  {t("hold.confirm")}
                </Button>
              </DialogFooter>
            </Stack>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
