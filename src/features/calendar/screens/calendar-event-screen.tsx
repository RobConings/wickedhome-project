import * as React from "react";
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { Card } from "../components/card";
import { ConfirmDialog } from "../components/confirm-dialog";
import { PageHeader } from "../components/page-header";
import { CalendarEntryDetails, type RenderShopList } from "../components/calendar-entry-details";
import { CalendarEventFormDialog } from "../components/calendar-event-form-dialog";
import { type CalendarActionResult, type CalendarEventScreenData } from "../data/calendar-loaders";

type CalendarEventScreenProps = {
  data: CalendarEventScreenData;
  canManage: boolean;
  renderShopList?: RenderShopList;
};

/** One event on its own page (`/calendar/events/:eventId`), e.g. linked from a shop or the dashboard. */
export function CalendarEventScreen({ data, canManage, renderShopList }: CalendarEventScreenProps) {
  const { t } = useTranslation("calendar");
  const { t: tCommon } = useTranslation();
  const { event, habitants, shops } = data;
  const fetcher = useFetcher<CalendarActionResult>();

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  return (
    <PageContainer className="max-w-3xl gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to={`/calendar?date=${event.startDate}`}>
          <ArrowLeftIcon />
          {t("eventPage.back")}
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: event.color }} aria-hidden="true" />
            {event.title}
          </span>
        }
        actions={
          canManage && (
            <>
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={fetcher.state !== "idle"}>
                    <Trash2Icon />
                    {t("actions.delete")}
                  </Button>
                }
                title={t("delete.title", { title: event.title })}
                description={event.rrule ? t("delete.recurringDescription") : t("delete.description")}
                confirmLabel={tCommon("actions.delete")}
                cancelLabel={tCommon("actions.cancel")}
                destructive
                onConfirm={() =>
                  fetcher.submit({ intent: "delete", id: event.id, date: event.startDate }, { method: "post" })
                }
              />
              <CalendarEventFormDialog
                event={event}
                habitants={habitants}
                shops={shops}
                trigger={
                  <Button>
                    <PencilIcon />
                    {t("actions.edit")}
                  </Button>
                }
              />
            </>
          )
        }
      />

      <Card>
        <CalendarEntryDetails event={event} habitants={habitants} shops={shops} renderShopList={renderShopList} />
      </Card>
    </PageContainer>
  );
}
