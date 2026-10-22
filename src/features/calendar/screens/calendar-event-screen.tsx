import * as React from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/shared/card";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { CalendarEntryDetails, type RenderShopList } from "../components/calendar-entry-details";
import { CalendarEventFormDialog } from "../components/calendar-event-form-dialog";
import { type CalendarActionResult, type CalendarEventScreenData } from "../data/calendar-loaders";
import { useFetcherErrorToast } from "@/lib/hooks/use-fetcher-result";
import { BackButton } from "@/components/shared/link-buttons";
import { ColorDot } from "@/components/shared/color-dot";

type CalendarEventScreenProps = {
  data: CalendarEventScreenData;
  canManage: boolean;
  renderShopList?: RenderShopList;
};

/** One event on its own page (`/calendar/events/:eventId`), e.g. linked from a shop or the dashboard. */
export function CalendarEventScreen({ data, canManage, renderShopList }: CalendarEventScreenProps) {
  const { t } = useTranslation("calendar");
  const { event, habitants, shops } = data;
  const fetcher = useFetcher<CalendarActionResult>();

  useFetcherErrorToast(fetcher);

  return (
    <PageContainer className="max-w-3xl gap-6">
      <BackButton to={`/calendar?date=${event.startDate}`} className="self-start">{t("eventPage.back")}</BackButton>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <ColorDot color={event.color} className="size-3.5 shrink-0 rounded-full" />
            {event.title}
          </span>
        }
        actions={
          canManage && (
            <>
              <DeleteConfirmDialog
                trigger={
                  <Button variant="outline" disabled={fetcher.state !== "idle"}>
                    <Trash2Icon />
                    {t("actions.delete")}
                  </Button>
                }
                title={t("delete.title", { title: event.title })}
                description={event.rrule ? t("delete.recurringDescription") : t("delete.description")}
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
