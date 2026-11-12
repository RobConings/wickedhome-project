import { CardHeading } from "@/components/shared/card";
import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import * as React from "react";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/shared/card";
import { GeneralForm, type GeneralFormField, type GeneralFormValues } from "@/components/shared/general-form";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { EnergyActionResult } from "../data/energy-loaders";
import {
  ENERGY_REGISTERS,
  READING_METERS,
  meterReadingFormSchema,
  readingMeterCarrier,
  type Appliance,
  type MeterKind,
  type MeterReading,
  type ReadingMeter,
} from "../types/energy";
import { zonedDateTime } from "../types/energy-time";
import { AppliancePicker } from "./appliance-picker";
import { formatKwh, formatM3 } from "./energy-format";

type MeterReadingFormProps = {
  readings: MeterReading[];
  appliances: Appliance[];
  /** Default date and time of a new reading, local (`YYYY-MM-DD`, `HH:MM`). */
  now: { date: string; time: string };
  canManage: boolean;
  defaults?: { meter: ReadingMeter; register: string; applianceId: string | null };
  historyLabel?: string;
};

/** Electricity grid meters have day/night registers; the inverter, the battery, gas and sub-meters have one. */
const hasRegisters = (kind: MeterKind | ReadingMeter) => kind === "grid_import" || kind === "grid_export";

const isReadingMeter = (value: unknown): value is ReadingMeter =>
  typeof value === "string" && (READING_METERS as readonly string[]).includes(value);
const meterOf = (values: GeneralFormValues): ReadingMeter => (isReadingMeter(values.meter) ? values.meter : "grid_import");
const isApplianceMeter = (meter: ReadingMeter) => meter === "appliance" || meter === "gas_appliance";

/** Enter a cumulative meter value; the list below shows recent readings. */
export function MeterReadingForm({ readings, appliances, now, canManage, defaults, historyLabel }: MeterReadingFormProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const deleter = useFetcher<EnergyActionResult>();
  const [meter, setMeter] = React.useState<ReadingMeter>(defaults?.meter ?? "grid_import");
  // A new form after each saved reading: clears the value, keeps the meter.
  const [formKey, setFormKey] = React.useState(0);
  const gas = readingMeterCarrier(meter) === "gas";

  const fields: GeneralFormField[] = [
    {
      name: "meter",
      type: "select",
      label: t("readings.fields.kind"),
      span: "half",
      options: READING_METERS.map((value) => ({ value, label: t(`readingMeters.${value}`) })),
    },
    {
      name: "register",
      type: "select",
      label: t("readings.fields.register"),
      span: "half",
      when: (values) => hasRegisters(meterOf(values)),
      options: ENERGY_REGISTERS.map((value) => ({ value, label: t(`registers.${value}`) })),
    },
    {
      name: "applianceId",
      type: "custom",
      label: t("readings.fields.appliance"),
      span: "half",
      when: (values) => isApplianceMeter(meterOf(values)),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <AppliancePicker
          id={id}
          name={name}
          appliances={appliances}
          value={typeof value === "string" && value !== "" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
        />
      ),
    },
    { name: "date", type: "date", label: t("readings.fields.date"), span: "half" },
    {
      name: "time",
      type: "custom",
      label: t("readings.fields.time"),
      span: "half",
      render: ({ id, name, value, setValue, invalid, describedBy, disabled }) => (
        <Input
          id={id}
          name={name}
          type="time"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      ),
    },
    {
      name: "value",
      type: "text",
      inputMode: "decimal",
      label: t(gas ? "readings.fields.valueM3" : "readings.fields.valueKwh"),
      description: gas ? t("readings.gasHint") : undefined,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardHeading title={<>{t("readings.title")}</>} description={<>{t("readings.description")}</>} />
      </CardHeader>

      {canManage && (
        <GeneralForm<EnergyActionResult>
          key={formKey}
          schema={meterReadingFormSchema}
          fields={fields}
          intent="create-reading"
          defaultValues={{ meter, register: defaults?.register ?? "day", applianceId: defaults?.applianceId ?? null, date: now.date, time: now.time, value: "" }}
          onValuesChange={(values) => setMeter(meterOf(values))}
          submitLabel={t("readings.add")}
          onSuccess={() => {
            toast.success(t("readings.created"));
            setFormKey((value) => value + 1);
          }}
        />
      )}

      <Stack gap="sm" className="border-t pt-4">
        <h3 className="text-sm font-medium">{historyLabel ?? t("readings.recent")}</h3>
        {readings.length === 0 ? (
          <Text size="sm" tone="muted">{t("readings.empty")}</Text>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {readings.map((reading) => {
              const when = zonedDateTime(reading.readAt);
              return (
                <li key={reading.id} className="flex items-center gap-3 py-2">
                  <Stack gap="none" className="min-w-0 flex-1">
                    <span className="truncate">
                      {reading.applianceName ?? (reading.carrier === "gas" ? t("readingMeters.gas") : t(`kinds.${reading.kind}`))}
                      {reading.carrier === "electricity" &&
                        hasRegisters(reading.kind) &&
                        ` · ${t(`registers.${reading.register}`)}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(when.date, locale)} · {when.time}
                    </span>
                  </Stack>
                  <span className="flex flex-col items-end">
                    <span className="font-medium tabular-nums">
                      {reading.valueLitres !== null ? formatM3(reading.valueLitres, locale) : formatKwh(reading.valueWh, locale)}
                    </span>
                    {reading.valueLitres !== null && (
                      <span className="text-xs text-muted-foreground tabular-nums">{formatKwh(reading.valueWh, locale)}</span>
                    )}
                  </span>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("readings.delete")}
                      disabled={deleter.state !== "idle"}
                      loading={deleter.state !== "idle" && deleter.formData?.get("id") === reading.id}
                      onClick={() => void deleter.submit({ intent: "delete-reading", id: reading.id }, { method: "post" })}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Stack>
    </Card>
  );
}
