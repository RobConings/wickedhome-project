import type * as React from "react";
import { CalendarIcon, HouseIcon, ShoppingBagIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Stack } from "./stack";
import type { GeneralFormCustomFieldProps, GeneralFormField, GeneralFormValues } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { RecurrenceFields } from "./recurrence-fields";
import { SegmentedControl } from "./segmented-control";
import type { Habitant } from "@/features/household";
import { ShopPicker, useShopSelections, type Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import { addDays, daysBetween, todayIn } from "@/types/dates";
import type { CalendarActionResult } from "../data/calendar-loaders";
import {
  CALENDAR_CATEGORIES,
  CALENDAR_ERROR_CODES,
  HOUSEHOLD_TARGET,
  calendarEventInputSchema,
  isExternalTarget,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarTarget,
} from "../types/calendar";
import { CalendarCategoryIcon } from "./calendar-category-icon";
import { ParticipantPicker } from "./participant-picker";

/** Pre-filled values for a new event, e.g. the day or hour that was clicked. */
export type CalendarEventDefaults = {
  date?: string;
  time?: string;
  kind?: CalendarEventKind;
  shopId?: string;
  participantIds?: string[];
};

type CalendarEventFormDialogProps = {
  /** Edit this event; omit to create a new one. */
  event?: CalendarEvent;
  defaults?: CalendarEventDefaults;
  habitants: Habitant[];
  shops: Shop[];
  /**
   * New events only: other calendars the event can go to (the person's writable Google calendars). With any,
   * the form starts with a calendar choice; in another calendar it is a plain event (no kind, people, category).
   */
  targets?: CalendarTarget[];
  /** Opens the dialog when clicked (uncontrolled). Or control it with `open` / `onOpenChange`. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Route whose action handles the form; defaults to the current route. */
  action?: string;
  /** Seed shop favourites/recents instead of fetching them (stories). */
  initialShopSelections?: UseSelectionsOptions["initial"];
};

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const pad = (value: number) => String(value).padStart(2, "0");
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** `date` `time` plus `minutes`, rolling over midnight. */
function shift(date: string, time: string, minutes: number) {
  const total = toMinutes(time) + minutes;
  const days = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, days), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` };
}

type Timing = { allDay: boolean; startDate: string; startTime: string; endDate: string; endTime: string };

function initialTiming(event: CalendarEvent | undefined, defaults: CalendarEventDefaults): Timing {
  if (event) {
    return {
      allDay: event.allDay,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime ?? "09:00",
      endTime: event.endTime ?? "10:00",
    };
  }
  const startDate = defaults.date ?? todayIn();
  const startTime = defaults.time ?? "09:00";
  const end = shift(startDate, startTime, 60);
  return { allDay: false, startDate, startTime, endDate: end.date, endTime: end.time };
}

/** Keeps the duration when the start moves: the end moves along. */
function keepDuration(next: GeneralFormValues, previous: GeneralFormValues): GeneralFormValues {
  const [startDate, startTime, endDate, endTime] = [previous.startDate, previous.startTime, previous.endDate, previous.endTime].map(text);
  if (!startDate || !endDate || !text(next.startDate)) return next;
  if (previous.allDay === true) {
    return { ...next, endDate: addDays(text(next.startDate), Math.max(0, daysBetween(startDate, endDate))) };
  }
  if (!startTime || !endTime || !text(next.startTime)) return next;
  const duration = daysBetween(startDate, endDate) * 1440 + toMinutes(endTime) - toMinutes(startTime);
  const end = shift(text(next.startDate), text(next.startTime), Math.max(duration, 15));
  return { ...next, endDate: end.date, endTime: end.time };
}

/**
 * The browser check uses the action's schema; the action reads the switch, "no category" and the
 * participant list from the form itself (`parseEventForm`), so do the same here.
 */
const eventFormSchema = z.preprocess((raw) => {
  const values = (raw ?? {}) as Record<string, unknown>;
  const external = isExternalTarget(typeof values.target === "string" ? values.target : null);
  return {
    ...values,
    category: values.category === "none" || external ? undefined : values.category,
    allDay: values.allDay === "on",
    participantIds: [],
    ...(external ? { kind: "event", shopId: undefined } : { target: undefined }),
  };
}, calendarEventInputSchema);

/** The household's own calendar is chosen (no other calendar picked). */
const inHousehold = (values: GeneralFormValues) => !isExternalTarget(text(values.target));

/** Create or edit a household event or store visit. Posts to the route action with an `intent`. */
export function CalendarEventFormDialog({
  event,
  defaults = {},
  habitants,
  shops,
  targets = [],
  trigger,
  open,
  onOpenChange,
  action,
  initialShopSelections,
}: CalendarEventFormDialogProps) {
  const { t } = useTranslation("calendar");
  const { recordUse } = useShopSelections({ initial: initialShopSelections });
  const isEdit = Boolean(event);
  const timing = initialTiming(event, defaults);
  const shopName = (id: unknown) => shops.find((shop) => shop.id === id)?.name ?? "";

  const translateError = (message: string) =>
    (CALENDAR_ERROR_CODES as readonly string[]).includes(message) ? t(`errors.${message}`) : message;

  const adjustValues = (next: GeneralFormValues, previous: GeneralFormValues, changed: string) => {
    if (changed === "startDate" || changed === "startTime") return keepDuration(next, previous);
    if (changed === "shopId") {
      // Suggest a title for a store visit ("Gamma") as long as the user hasn't typed one.
      const name = shopName(next.shopId);
      const title = text(previous.title);
      if (name && (title === "" || title === shopName(previous.shopId))) return { ...next, title: name };
    }
    return next;
  };

  /** A date or time input; the start fields ignore being emptied (their end follows them). */
  const dateTimeInput =
    (type: "date" | "time", options: { keepValue?: boolean; minFrom?: string } = {}) =>
    ({ id, name, value, setValue, values, invalid, describedBy, disabled }: GeneralFormCustomFieldProps) => (
      <Input
        id={id}
        name={name}
        type={type}
        step={type === "time" ? 300 : undefined}
        min={options.minFrom ? text(values[options.minFrom]) || undefined : undefined}
        value={text(value)}
        onChange={(change) => {
          if (change.target.value || !options.keepValue) setValue(change.target.value);
        }}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
    );

  const timed = (values: GeneralFormValues) => values.allDay !== true;

  const fields: GeneralFormField[] = [
    {
      name: "target",
      type: "select",
      label: t("fields.calendar"),
      hidden: isEdit || targets.length === 0,
      options: [
        { value: HOUSEHOLD_TARGET, label: t("targets.household"), icon: <HouseIcon className="size-4" /> },
        ...targets.map((target) => ({
          value: target.id,
          label: (
            <span className="min-w-0 truncate">
              {target.label}
              {target.account && target.account !== target.label && <span className="text-muted-foreground"> · {target.account}</span>}
            </span>
          ),
          icon: <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: target.color ?? "var(--muted-foreground)" }} aria-hidden />,
        })),
      ],
    },
    {
      name: "kind",
      type: "custom",
      label: t("fields.kind"),
      bare: true,
      when: inHousehold,
      render: ({ name, value, setValue, disabled }) => (
        <SegmentedControl
          label={t("fields.kind")}
          name={name}
          value={(value as CalendarEventKind) || "event"}
          onChange={(kind) => !disabled && setValue(kind)}
          options={[
            { value: "event", label: t("kinds.event"), icon: CalendarIcon },
            { value: "store_visit", label: t("kinds.store_visit"), icon: ShoppingBagIcon },
          ]}
          className="self-start"
        />
      ),
    },
    {
      name: "shopId",
      type: "custom",
      label: t("fields.shop"),
      optional: false,
      when: (values) => values.kind === "store_visit" && inHousehold(values),
      render: ({ id, name, value, setValue, invalid }) => (
        <ShopPicker
          id={id}
          name={name}
          shops={shops}
          value={typeof value === "string" && value ? value : null}
          onChange={setValue}
          initialSelections={initialShopSelections}
          invalid={invalid}
        />
      ),
    },
    {
      name: "title",
      type: "custom",
      label: t("fields.title"),
      optional: false,
      render: ({ id, name, value, setValue, invalid, describedBy, disabled }) => (
        <Input
          id={id}
          name={name}
          value={text(value)}
          onChange={(change) => setValue(change.target.value)}
          placeholder={t("fields.titlePlaceholder")}
          autoComplete="off"
          // Start in the title, not on the first radio of the type switch.
          autoFocus
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      ),
    },
    { name: "allDay", type: "switch", label: t("fields.allDay") },
    {
      name: "startDate",
      type: "custom",
      label: t("fields.startDate"),
      span: "half",
      optional: false,
      render: dateTimeInput("date", { keepValue: true }),
    },
    {
      name: "startTime",
      type: "custom",
      label: t("fields.startTime"),
      span: "half",
      optional: false,
      when: timed,
      render: dateTimeInput("time", { keepValue: true }),
    },
    {
      name: "endDate",
      type: "custom",
      label: t("fields.endDate"),
      span: "half",
      optional: false,
      render: dateTimeInput("date", { minFrom: "startDate" }),
    },
    {
      name: "endTime",
      type: "custom",
      label: t("fields.endTime"),
      span: "half",
      optional: false,
      when: timed,
      render: dateTimeInput("time"),
    },
    {
      name: "rrule",
      type: "custom",
      label: t("fields.repeat"),
      bare: true,
      render: ({ id, name, values, errors }) => (
        <RecurrenceFields
          name={name}
          id={id}
          label={t("fields.repeat")}
          defaultValue={event?.rrule}
          startDate={text(values.startDate)}
          errors={errors}
        />
      ),
    },
    {
      name: "participantIds",
      type: "custom",
      label: t("fields.participants"),
      bare: true,
      hidden: habitants.length === 0,
      when: inHousehold,
      render: ({ name, errors }) => (
        <Stack gap="sm">
          <span className="text-sm font-medium">{t("fields.participants")}</span>
          <ParticipantPicker
            name={name}
            label={t("fields.participants")}
            habitants={habitants}
            defaultValue={event?.participantIds ?? defaults.participantIds}
          />
          {errors && <p className="text-xs font-medium text-destructive">{errors.join(" ")}</p>}
        </Stack>
      ),
    },
    {
      name: "category",
      type: "select",
      label: t("fields.category"),
      span: "half",
      optional: true,
      when: inHousehold,
      options: [
        { value: "none", label: t("categories.none") },
        ...CALENDAR_CATEGORIES.map((category) => ({
          value: category,
          label: t(`categories.${category}`),
          icon: <CalendarCategoryIcon category={category} colored className="size-4" />,
        })),
      ],
    },
    {
      name: "location",
      type: "text",
      label: t("fields.location"),
      span: "half",
      optional: true,
      placeholder: t("fields.locationPlaceholder"),
    },
    { name: "description", type: "textarea", label: t("fields.description"), rows: 3, optional: true },
  ];

  return (
    <GeneralFormDialog<CalendarActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      action={action}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={event?.rrule ? t("form.seriesNote") : t("form.description")}
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      onSuccess={(result) => {
        if (result.event?.shop) void recordUse(result.event.shop.id);
      }}
      schema={eventFormSchema}
      translateError={translateError}
      adjustValues={adjustValues}
      fields={fields}
      intent={isEdit ? "update" : "create"}
      hiddenFields={{ id: event?.id }}
      defaultValues={{
        target: HOUSEHOLD_TARGET,
        kind: event?.kind ?? defaults.kind ?? "event",
        shopId: event?.shop?.id ?? defaults.shopId ?? "",
        title: event?.title ?? "",
        allDay: timing.allDay,
        startDate: timing.startDate,
        startTime: timing.startTime,
        endDate: timing.endDate,
        endTime: timing.endTime,
        category: event?.category ?? "none",
        location: event?.location ?? "",
        description: event?.description ?? "",
      }}
    />
  );
}
