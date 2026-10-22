import type * as React from "react";
import { ClockIcon, ListIcon, MapPinIcon, RepeatIcon, StickyNoteIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { ShopBadge, type Shop } from "@/features/shops";
import { currentLocale } from "@/lib/i18n";
import { describeRecurrence } from "@/lib/recurrence-format";
import { cn } from "@/lib/utils";
import type { CalendarEntry, CalendarEvent } from "../types/calendar";
import { CalendarCategoryIcon } from "./calendar-category-icon";
import { formatEntryWhen, formatEventWhen } from "./calendar-format";
import { CalendarEntryIcon } from "./calendar-entry-icon";

/**
 * Slot for the Shopping feature: renders "what to buy at this shop" inside a store visit. The calendar
 * never imports Shopping; the route (or app) that renders the calendar passes this in.
 */
export type RenderShopList = (shopId: string) => React.ReactNode;

type CalendarEntryDetailsProps = {
  /** The occurrence that was clicked (its own date and time). */
  entry?: CalendarEntry;
  /** The household event behind it, when there is one; gives notes and the repeat rule. */
  event?: CalendarEvent | null;
  habitants: Habitant[];
  shops: Shop[];
  renderShopList?: RenderShopList;
  className?: string;
};

function Row({ icon: Icon, label, children }: { icon: typeof ClockIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </div>
  );
}

/** What, when, who and where of one calendar entry, plus the shop's list for store visits. */
export function CalendarEntryDetails({ entry, event, habitants, shops, renderShopList, className }: CalendarEntryDetailsProps) {
  const { t } = useTranslation("calendar");
  const locale = currentLocale();
  const kind = entry?.kind ?? event?.kind ?? "event";
  const participantIds = entry?.participantIds ?? event?.participantIds ?? [];
  const people = participantIds.flatMap((id) => habitants.find((habitant) => habitant.id === id) ?? []);
  const location = entry?.location ?? event?.location ?? null;
  const shopRef = entry?.shop ?? event?.shop ?? null;
  // The reference carries the logo; the loaded shop list (fresher after an edit) wins when it has the shop.
  const shop = shopRef ? (shops.find((candidate) => candidate.id === shopRef.id) ?? shopRef) : null;
  const when = entry ? formatEntryWhen(entry, locale) : event ? formatEventWhen(event, locale) : "";
  const recurrence = describeRecurrence(event?.rrule ?? null, locale, t);
  const category = event?.category;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 font-normal">
          <CalendarEntryIcon kind={kind} />
          {t(`kinds.${kind}`)}
        </Badge>
        {category && (
          <Badge variant="secondary" className="gap-1 font-normal">
            <CalendarCategoryIcon category={category} colored />
            {t(`categories.${category}`)}
          </Badge>
        )}
        {entry?.readOnly && (
          <Badge variant="secondary" className="font-normal">
            {t("entry.readOnly")}
          </Badge>
        )}
      </div>

      <Row icon={ClockIcon} label={t("detail.when")}>
        <span className="first-letter:uppercase">{when}</span>
      </Row>

      {recurrence && (
        <Row icon={RepeatIcon} label={t("detail.repeats")}>
          {recurrence}
        </Row>
      )}

      {kind !== "birthday" && (
        <Row icon={UsersIcon} label={t("detail.participants")}>
          {people.length > 0 ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
              {people.map((habitant) => (
                <li key={habitant.id} className="flex items-center gap-1.5">
                  <HabitantAvatar habitant={habitant} size="sm" />
                  {habitant.name}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">{t("detail.everyone")}</span>
          )}
        </Row>
      )}

      {location && (
        <Row icon={MapPinIcon} label={t("detail.location")}>
          {location}
        </Row>
      )}

      {event?.description && (
        <Row icon={StickyNoteIcon} label={t("detail.notes")}>
          <p className="whitespace-pre-line">{event.description}</p>
        </Row>
      )}

      {entry?.readOnly && <p className="text-sm text-muted-foreground">{t("detail.managedIn")}</p>}

      {shop && (
        <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3" aria-labelledby="store-visit-list">
          <div className="flex items-center justify-between gap-2">
            <h3 id="store-visit-list" className="flex items-center gap-2 text-sm font-semibold">
              <ListIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              {t("detail.shopList")}
            </h3>
            <ShopBadge shop={shop} linked />
          </div>
          {renderShopList ? (
            renderShopList(shop.id)
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.shopListPlaceholder", { shop: shop.name })}</p>
          )}
        </section>
      )}
    </div>
  );
}
