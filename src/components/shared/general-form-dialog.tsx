import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { GeneralForm, type GeneralFormProps, type GeneralFormValues } from "@/components/shared/general-form";
import type { FormResult } from "@/lib/forms";
import { cn } from "@/lib/utils";

/**
 * A second action in the dialog's footer, apart from Cancel/Save (on the left from `sm` up, at the bottom on
 * phones), typically "Delete". It posts its own `intent` with a fetcher of its own, so it has its own busy
 * state; it is disabled while the form saves, and the form while it runs. On success it toasts and closes
 * the dialog; on failure it toasts the error and the dialog stays open.
 */
export type GeneralFormDialogSecondaryAction<R extends FormResult = FormResult> = {
  /** Button text, e.g. "Delete". */
  label: string;
  /** Icon before the label, e.g. `<Trash2Icon />`. */
  icon?: React.ReactNode;
  /** Red text, and a red confirm button. */
  destructive?: boolean;
  /** Ask first ("Delete X?"); the confirm button repeats `label` unless `confirmLabel` is given. Leave out to act at once. */
  confirm?: { title: React.ReactNode; description?: React.ReactNode; confirmLabel?: string };
  /** Posted as `intent`, with `data`. */
  intent: string;
  /** Extra values to post, e.g. `{ id: item.id }`. Empty values are left out. */
  data?: Record<string, string | number | null | undefined>;
  /** Route to post to; defaults to the form's `action` (or the current route). */
  action?: string;
  /** Toast after it succeeded. */
  successMessage?: string;
  /** After it succeeded (the dialog closes by itself). */
  onSuccess?: (result: R) => void;
};

type GeneralFormDialogProps<R extends FormResult = FormResult> = Omit<
  GeneralFormProps<R>,
  "onCancel" | "renderActions" | "onSubmittingChange" | "onValuesChange"
> & {
  /** Opens the dialog. Leave out when you control `open`. */
  trigger?: React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Shown before the title, with the live form values (e.g. an avatar or logo preview). */
  media?: (values: GeneralFormValues) => React.ReactNode;
  /** Toast shown after a successful save. */
  successMessage?: string;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Width and other classes of the dialog panel. */
  contentClassName?: string;
  /** A second footer action apart from Cancel/Save, e.g. "Delete" (see `GeneralFormDialogSecondaryAction`). */
  secondaryAction?: GeneralFormDialogSecondaryAction<R>;
};

/**
 * The common "dialog with a form": opens from its trigger, stays open (and can't be closed) while saving,
 * keeps showing errors after a failed save and closes by itself once the save succeeded. Every opening
 * starts with a fresh form. An optional `secondaryAction` (e.g. Delete) sits apart in the footer.
 */
export function GeneralFormDialog<R extends FormResult = FormResult>({
  trigger,
  title,
  description,
  media,
  successMessage,
  open: controlledOpen,
  onOpenChange,
  contentClassName,
  secondaryAction,
  onSuccess,
  defaultValues,
  ...formProps
}: GeneralFormDialogProps<R>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [secondaryBusy, setSecondaryBusy] = React.useState(false);
  const [values, setValues] = React.useState<GeneralFormValues>(defaultValues ?? {});
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const handleOpenChange = (next: boolean) => {
    // Stays open while saving (or while the secondary action runs); it closes by itself once that succeeded.
    if (!next && (submitting || secondaryBusy)) return;
    if (!next) setSubmitting(false);
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg", contentClassName)}>
        <DialogHeader>
          <Inline gap="md">
            {media?.(values)}
            <Stack gap="xs" className="min-w-0 text-left">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </Stack>
          </Inline>
        </DialogHeader>
        <GeneralForm<R>
          {...formProps}
          defaultValues={defaultValues}
          onValuesChange={setValues}
          onSubmittingChange={setSubmitting}
          onCancel={() => handleOpenChange(false)}
          onSuccess={(result) => {
            if (successMessage) toast.success(successMessage);
            setSubmitting(false);
            setOpen(false);
            onSuccess?.(result);
          }}
          renderActions={(buttons) => (
            <DialogFooter>
              {/* First: at the bottom on phones (the footer stacks reversed), on the left from `sm` up. */}
              {secondaryAction && (
                <SecondaryActionButton
                  {...secondaryAction}
                  action={secondaryAction.action ?? formProps.action}
                  onBusyChange={setSecondaryBusy}
                  onDone={(result) => {
                    setSecondaryBusy(false);
                    setOpen(false);
                    secondaryAction.onSuccess?.(result);
                  }}
                />
              )}
              {/* Cancel/Save wait while the secondary action runs (`contents` keeps the footer layout). */}
              <fieldset disabled={secondaryBusy} className="contents">
                {buttons}
              </fieldset>
            </DialogFooter>
          )}
        />
      </DialogContent>
    </Dialog>
  );
}

type SecondaryActionButtonProps<R extends FormResult> = GeneralFormDialogSecondaryAction<R> & {
  onBusyChange: (busy: boolean) => void;
  onDone: (result: R) => void;
};

/** The footer's secondary action: a button (with a confirm step) that posts with its own fetcher. */
function SecondaryActionButton<R extends FormResult>({
  label,
  icon,
  destructive = false,
  confirm,
  intent,
  data,
  action,
  successMessage,
  onBusyChange,
  onDone,
}: SecondaryActionButtonProps<R>) {
  const { t } = useTranslation();
  const fetcher = useFetcher<R>();
  const busy = fetcher.state !== "idle";
  const submitted = React.useRef(false);

  const callbacks = React.useRef({ onBusyChange, onDone, successMessage });
  React.useEffect(() => {
    callbacks.current = { onBusyChange, onDone, successMessage };
  });

  React.useEffect(() => {
    callbacks.current.onBusyChange(busy);
  }, [busy]);

  // Once the post is done: close on success (or after a redirect, which leaves no data), toast an error otherwise.
  React.useEffect(() => {
    if (busy || !submitted.current) return;
    submitted.current = false;
    const result = fetcher.data;
    if (!result || result.ok === true) {
      if (callbacks.current.successMessage) toast.success(callbacks.current.successMessage);
      callbacks.current.onDone((result ?? {}) as R);
      return;
    }
    const message = result.formError ?? Object.values(result.errors ?? {}).flat()[0] ?? t("errors.generic");
    toast.error(message);
  }, [busy, fetcher.data, t]);

  const run = () => {
    submitted.current = true;
    const body: Record<string, string> = { intent };
    for (const [name, value] of Object.entries(data ?? {})) {
      if (value !== null && value !== undefined && value !== "") body[name] = String(value);
    }
    return fetcher.submit(body, { method: "post", action });
  };

  const button = (
    <Button
      type="button"
      variant="ghost"
      loading={busy}
      onClick={confirm ? undefined : () => void run()}
      className={cn("sm:mr-auto", destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
    >
      {!busy && icon}
      {label}
    </Button>
  );

  if (!confirm) return button;
  return (
    <ConfirmDialog
      trigger={button}
      title={confirm.title}
      description={confirm.description}
      confirmLabel={confirm.confirmLabel ?? label}
      cancelLabel={t("actions.cancel")}
      destructive={destructive}
      onConfirm={run}
    />
  );
}
