import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Card, CardTitle } from "@/components/shared/card";
import { FormField } from "@/components/shared/form-field";
import { InlineAlert } from "@/components/shared/inline-alert";
import { homeActionInputSchema, type HomeAction, type HomeActionInput, type HomeActionStep, type HomeControlDevice } from "../types/home-actions";
import { publishAction, saveAction } from "../data/home-actions-requests";

type DeviceStep = Extract<HomeActionStep, { kind: "device" }>;
export function HomeActionEditor({ initial, devices, onSaved, onClose, canPublish }: { initial?: HomeAction; devices: HomeControlDevice[]; onSaved: () => void; onClose: () => void; canPublish: boolean }) {
  const { t } = useTranslation("home-actions");
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<HomeActionInput>(initial ? homeActionInputSchema.strip().parse(initial) : { name: "", icon: "sparkles", favourite: true, contactDeviceIds: [], alarmMode: null, steps: [] });
  const [dirty, setDirty] = useState(!initial), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const update = (change: Partial<HomeActionInput>) => { setDraft((previous) => ({ ...previous, ...change })); setDirty(true); };
  const step = (index: number, change: HomeActionStep) => update({ steps: draft.steps.map((value, i) => i === index ? change : value) });
  const controlled = devices.filter((device) => device.controls.some((control) => control.actions.length || control.adjustment || control.choices?.length));
  const newDeviceStep = (device: HomeControlDevice): DeviceStep => {
    const control = device.controls.find((item) => item.actions.length || item.adjustment || item.choices?.length)!;
    const choice = control.choices?.[0];
    return { kind: "device", deviceId: device.id, entityId: control.entityId, onFailure: "stop", action: control.adjustment?.action ?? control.actions.filter((action) => !["next", "previous"].includes(action))[0] ?? choice?.action ?? "off", ...(control.adjustment ? { value: control.adjustment.value ?? control.adjustment.min } : choice ? { option: choice.value ?? choice.values[0] } : {}) };
  };
  const submit = async () => {
    const input = homeActionInputSchema.safeParse(draft);
    if (!input.success) { setError(t("editor.invalid")); return; }
    setBusy(true); setError(null);
    try { const next = await saveAction(input.data, saved?.id, saved?.revision); setSaved(next); setDraft(homeActionInputSchema.strip().parse(next)); setDirty(false); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : t("failed")); } finally { setBusy(false); }
  };
  return <Card aria-label={t("editor.title")}>
    <Inline justify="between" wrap><CardTitle>{t("editor.title")}</CardTitle><Button variant="ghost" onClick={onClose}>{t("close")}</Button></Inline>
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    <FormField htmlFor="action-name" label={t("editor.name")}><Input id="action-name" value={draft.name} maxLength={70} onChange={(event) => update({ name: event.target.value })} /></FormField>
    <FormField htmlFor="action-icon" label={t("editor.icon")}><select id="action-icon" className="min-h-11 w-full rounded-md border bg-background p-2 text-base" value={draft.icon} onChange={(event) => update({ icon: event.target.value as HomeActionInput["icon"] })}>{["house", "log-out", "moon", "tv", "sparkles"].map((icon) => <option key={icon} value={icon}>{t(`icons.${icon}`)}</option>)}</select></FormField>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.favourite} onChange={(event) => update({ favourite: event.target.checked })} />{t("editor.favourite")}</label>
    <FormField htmlFor="action-alarm" label={t("editor.alarm")} description={t("editor.alarmHint")}><select id="action-alarm" className="min-h-11 w-full rounded-md border bg-background p-2 text-base" value={draft.alarmMode ?? "none"} onChange={(event) => update({ alarmMode: event.target.value === "none" ? null : event.target.value as "home" | "away" })}><option value="none">{t("editor.noAlarm")}</option><option value="away">{t("editor.armAway")}</option><option value="home">{t("editor.armHome")}</option></select></FormField>
    <details><summary className="min-h-11 cursor-pointer py-2">{t("editor.contacts", { count: draft.contactDeviceIds.length })}</summary><Stack gap="sm">{devices.filter((device) => device.contactEntityIds.length).map((device) => <label key={device.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.contactDeviceIds.includes(device.id)} onChange={(event) => update({ contactDeviceIds: event.target.checked ? [...draft.contactDeviceIds, device.id] : draft.contactDeviceIds.filter((id) => id !== device.id) })} />{device.name}{device.room ? ` · ${device.room}` : ""}</label>)}</Stack></details>
    <Stack gap="md">{draft.steps.map((item, index) => {
      const device = item.kind === "device" ? devices.find((candidate) => candidate.id === item.deviceId) : undefined;
      const control = item.kind === "device" ? device?.controls.find((candidate) => candidate.entityId === item.entityId) : undefined;
      const adjustment = control?.adjustment, choice = item.kind === "device" ? control?.choices?.find((value) => value.action === item.action) : undefined;
      const actions = control ? [...new Set([...control.actions.filter((action) => !["next", "previous"].includes(action)), ...(adjustment ? [adjustment.action] : []), ...(control.choices?.map((value) => value.action) ?? [])])] : [];
      return <Stack key={index} gap="sm" className="rounded-xl border p-3">
        <Inline justify="between" wrap><Text weight="medium">{index + 1}. {item.kind === "wait" ? t("editor.wait") : device?.name ?? item.entityId}</Text><Inline><Button variant="ghost" size="icon" disabled={index === 0 || busy} aria-label={t("editor.up")} onClick={() => { const steps = [...draft.steps]; [steps[index - 1], steps[index]] = [steps[index]!, steps[index - 1]!]; update({ steps }); }}><ArrowUpIcon /></Button><Button variant="ghost" size="icon" disabled={busy} aria-label={t("editor.remove")} onClick={() => update({ steps: draft.steps.filter((_, i) => i !== index) })}><Trash2Icon /></Button></Inline></Inline>
        {item.kind === "wait" ? <FormField htmlFor={`step-wait-${index}`} label={t("editor.seconds")}><Input id={`step-wait-${index}`} type="number" min={1} max={300} value={item.seconds} onChange={(event) => step(index, { ...item, seconds: Number(event.target.value) })} /></FormField> : <>
          <FormField htmlFor={`step-device-${index}`} label={t("editor.device")}><select id={`step-device-${index}`} className="min-h-11 w-full rounded-md border bg-background p-2 text-base" value={item.deviceId} onChange={(event) => { const target = controlled.find((candidate) => candidate.id === event.target.value); if (target) step(index, newDeviceStep(target)); }}>{controlled.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.room ? ` · ${candidate.room}` : ""}</option>)}</select></FormField>
          {device && device.controls.length > 1 && <FormField htmlFor={`step-source-${index}`} label={t("editor.control")}><select id={`step-source-${index}`} className="min-h-11 w-full rounded-md border bg-background p-2 text-base" value={item.entityId} onChange={(event) => { const target = device.controls.find((candidate) => candidate.entityId === event.target.value); if (target) step(index, newDeviceStep({ ...device, controls: [target] })); }}>{device.controls.map((candidate) => <option key={candidate.entityId} value={candidate.entityId}>{candidate.name}</option>)}</select></FormField>}
          <FormField htmlFor={`step-command-${index}`} label={t("editor.command")}><select id={`step-command-${index}`} className="min-h-11 w-full rounded-md border bg-background p-2 text-base" value={item.action} onChange={(event) => { const action = event.target.value as DeviceStep["action"], selection = control?.choices?.find((value) => value.action === action); step(index, { kind: "device", deviceId: item.deviceId, entityId: item.entityId, onFailure: item.onFailure, action, ...(adjustment?.action === action ? { value: adjustment.value ?? adjustment.min } : {}), ...(selection ? { option: selection.value ?? selection.values[0] } : {}) }); }}>{actions.map((action) => <option key={action} value={action}>{t(`commands.${action}`)}</option>)}</select></FormField>
          {adjustment?.action === item.action && <FormField htmlFor={`step-value-${index}`} label={`${t(`commands.${item.action}`)} (${adjustment.unit})`}><Input id={`step-value-${index}`} type="number" min={adjustment.min} max={adjustment.max} step={adjustment.step} value={item.value ?? ""} onChange={(event) => step(index, { ...item, value: Number(event.target.value) })} /></FormField>}
          {choice && <FormField htmlFor={`step-choice-${index}`} label={t("editor.setting")}><select id={`step-choice-${index}`} className="min-h-11 w-full rounded-md border bg-background p-2 text-base" value={item.option} onChange={(event) => step(index, { ...item, option: event.target.value })}>{choice.values.map((value) => <option key={value}>{value}</option>)}</select></FormField>}
          {device?.notes && <Text size="sm" tone="muted">{device.notes}</Text>}
          <FormField htmlFor={`step-policy-${index}`} label={t("editor.onFailure")}><select id={`step-policy-${index}`} className="min-h-11 w-full rounded-md border bg-background p-2 text-base" value={item.onFailure} onChange={(event) => step(index, { ...item, onFailure: event.target.value as "stop" | "continue" })}><option value="stop">{t("editor.stop")}</option><option value="continue">{t("editor.continue")}</option></select></FormField>
        </>}
      </Stack>;
    })}</Stack>
    <Inline wrap><Button variant="outline" disabled={busy || !controlled.length || draft.steps.length >= 20} onClick={() => update({ steps: [...draft.steps, newDeviceStep(controlled[0]!)] })}><PlusIcon />{t("editor.addDevice")}</Button><Button variant="outline" disabled={busy || draft.steps.length >= 20} onClick={() => update({ steps: [...draft.steps, { kind: "wait", seconds: 10 }] })}>{t("editor.addWait")}</Button></Inline>
    <Inline wrap><Button loading={busy} onClick={() => void submit()}><SaveIcon />{t("editor.save")}</Button>{saved && <Button variant="outline" disabled={busy || dirty || saved.publishedRevision === saved.revision || !canPublish} onClick={() => { setBusy(true); setError(null); void publishAction(saved).then(() => { setSaved({ ...saved, publishedRevision: saved.revision }); onSaved(); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : t("failed"))).finally(() => setBusy(false)); }}>{t("editor.publish")}</Button>}<Text size="sm" tone="muted">{dirty ? t("editor.unsaved") : saved?.publishedRevision === saved?.revision ? t("editor.published") : t("editor.draft")}</Text></Inline>
  </Card>;
}
