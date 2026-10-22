import * as React from "react";
import { ExternalLinkIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "./confirm-dialog";
import type { Habitant } from "@/features/household";
import type { Shop } from "@/features/shops";
import type { CalendarActionResult } from "../data/calendar-loaders";
import { calendarEventPath, type CalendarEntry, type CalendarEvent } from "../types/calendar";
import { entryTitle } from "./calendar-format";
import { CalendarEntryDetails, type RenderShopList } from "./calendar-entry-details";

type CalendarEntryDialogProps = {
  /** The entry to show; `null` closes the dialog. */
  entry: CalendarEntry | null;
  /** The household event behind the entry, if any. */
  event?: CalendarEvent | null;
  habitants: Habitant[];
  shops: Shop[];
  canManage: boolean;
  onClose: () => void;
  /** Called with the event to edit; the screen opens the form. */
  onEdit?: (event: CalendarEvent) => void;
  renderShopList?: RenderShopList;
};

/** Details of a clicked entry with edit and delete for household events, or a link for overlays. */
export function CalendarEntryDialog({
  entry,
  event,
  habitants,
  shops,
  canManage,
  onClose,
  onEdit,
  renderShopList,
}: CalendarEntryDialogProps) {
  const { t } = useTranslation("calendar");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<CalendarActionResult>();
  const deleting = fetcher.state !== "idle";
  // Keep showing the last entry while the dialog animates closed.
  const [shown, setShown] = React.useState(entry);
  if (entry && entry !== shown) setShown(entry);

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok && fetcher.data.intent === "delete") {
      toast.success(t("form.deleted"));
      onClose();
    } else if (fetcher.data.formError) {
      toast.error(fetcher.data.formError);
    }
  }, [fetcher.state, fetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps -- react to the fetcher only

  const current = entry ?? shown;
  if (!current) return null;
  const editable = canManage && !current.readOnly && event;
  const title = entryTitle(current, t);

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: current.color }} aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="text-xl">{title}</DialogTitle>
              <DialogDescription className="sr-only">{t(`kinds.${current.kind}`)}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <CalendarEntryDetails
          entry={current}
          event={event}
          habitants={habitants}
          shops={shops}
          renderShopList={renderShopList}
        />

        <DialogFooter className="gap-2 sm:justify-between">
          {current.readOnly ? (
            current.href && (
              <Button asChild variant="outline">
                <Link to={current.href}>
                  <ExternalLinkIcon />
                  {t("actions.open")}
                </Link>
              </Button>
            )
          ) : (
            current.eventId && (
              <Button asChild variant="ghost">
                <Link to={calendarEventPath(current.eventId)}>
                  <ExternalLinkIcon />
                  {t("actions.openEvent")}
                </Link>
              </Button>
            )
          )}
          {editable && (
            <div className="flex gap-2">
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={deleting}>
                    <Trash2Icon />
                    {t("actions.delete")}
                  </Button>
                }
                title={t("delete.title", { title: event.title })}
                description={event.rrule ? t("delete.recurringDescription") : t("delete.description")}
                confirmLabel={tCommon("actions.delete")}
                cancelLabel={tCommon("actions.cancel")}
                destructive
                onConfirm={() => fetcher.submit({ intent: "delete", id: event.id }, { method: "post" })}
              />
              <Button onClick={() => onEdit?.(event)}>
                <PencilIcon />
                {t("actions.edit")}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
