import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { formatDateTime } from "@/types/date-format";
import { currentLocale } from "@/lib/i18n";
import { useLiveEvents } from "@/lib/live-events";
import { useEffect, useState } from "react";
import { PowerIcon, SlidersHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchDeviceControls, sendDeviceControl } from "../data/home-assistant-requests";
import type { HaDeviceControls } from "../types/home-assistant";
import { z } from "zod";

export function HaDeviceControlPanel({ deviceId, initial }: { deviceId: string; initial?: HaDeviceControls }) {
  const { t } = useTranslation("home-assistant");
  const resource = useAsyncResource(`ha-controls:${deviceId}`, () => fetchDeviceControls(deviceId), { initial });
  useLiveEvents("device.value", resource.refresh, { enabled: !initial });
  useLiveEvents("home_assistant.status", resource.refresh, { enabled: !initial });
  useEffect(() => { if (initial) return; const timer = window.setInterval(resource.refresh, 30_000); return () => window.clearInterval(timer); }, [initial, resource.refresh]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = resource.data;
  if (!data && !resource.error) return null;
  return <Card id="device-controls" className="scroll-mt-20">
    <CardTitle><PowerIcon className="mr-2 inline size-5 text-section" />{t("controls.title")}</CardTitle>
    {resource.error ? <InlineAlert tone="error">{t("controls.loadError")} <Button variant="outline" onClick={resource.refresh}>{t("controls.retry")}</Button></InlineAlert> : !data?.connected ? <CardDescription>{t("controls.offline")}</CardDescription> : <>
      <CardDescription>{t("controls.description")}</CardDescription>
      {!data.controls.length && <Text size="sm" tone="muted">{t("controls.none")}</Text>}
      {data.controls.map((control) => <Stack gap="3" key={control.entityId} className="rounded-xl border p-3">
        <div><Text weight="medium">{control.name}</Text><Text size="sm" tone="muted">{control.state}{control.updatedAt && <> · <time dateTime={control.updatedAt}>{formatDateTime(control.updatedAt, currentLocale())}</time></>}</Text></div>
        <Inline gap="sm" align="stretch" wrap>{control.actions.map((action) => <Button key={action} variant="outline" disabled={busy}
          onClick={async () => { setBusy(true); setError(null); try { await sendDeviceControl(deviceId, { entityId: control.entityId, action }); resource.refresh(); } catch { setError(t("controls.failed")); } finally { setBusy(false); } }}>{t(`controls.${action}`)}</Button>)}
          {control.adjustment && <GeneralFormDialog trigger={<Button variant="outline" disabled={busy}><SlidersHorizontalIcon />{t(`controls.${control.adjustment.action}`)}</Button>}
            title={`${control.name} · ${t(`controls.${control.adjustment.action}`)}`} description={t("controls.adjustHint")}
            action={`/home-assistant?device=${encodeURIComponent(deviceId)}`} intent="control-device"
            hiddenFields={{ deviceId, entityId: control.entityId, controlAction: control.adjustment.action }}
            schema={z.object({ value: z.coerce.number().min(control.adjustment.min).max(control.adjustment.max).refine((value) => { const steps = (value - control.adjustment!.min) / control.adjustment!.step; return Math.abs(steps - Math.round(steps)) < 0.000001; }) })}
            defaultValues={{ value: control.adjustment.value ?? undefined }} fields={[{ name: "value", type: "number", label: `${t(`controls.${control.adjustment.action}`)} (${control.adjustment.unit})`, min: control.adjustment.min, max: control.adjustment.max, step: control.adjustment.step }]}
            onSuccess={() => resource.refresh()} />}
          {control.choices?.map((choice) => <GeneralFormDialog key={choice.action} trigger={<Button variant="outline" disabled={busy}>{t(`controls.${choice.action}`)}{choice.value ? ` · ${choice.value}` : ""}</Button>}
            title={`${control.name} · ${t(`controls.${choice.action}`)}`} description={t("controls.adjustHint")}
            action={`/home-assistant?device=${encodeURIComponent(deviceId)}`} intent="control-device"
            hiddenFields={{ deviceId, entityId: control.entityId, controlAction: choice.action }}
            schema={z.object({ option: z.string().refine((option) => choice.values.includes(option)) })}
            defaultValues={{ option: choice.value ?? choice.values[0] }} fields={[{ name: "option", type: "select", label: t(`controls.${choice.action}`), options: choice.values.map((option) => ({ value: option, label: option })) }]}
            onSuccess={() => resource.refresh()} />)}
        </Inline>
        {!control.actions.length && !control.adjustment && !control.choices?.length && <Text size="sm" tone="muted">{t("controls.unavailable")}</Text>}
      </Stack>)}
    </>}
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
  </Card>;
}
