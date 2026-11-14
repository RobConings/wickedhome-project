import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { FormField } from "@/components/shared/form-field";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { HomeAction, HomeActionPreview } from "../types/home-actions";
import { previewAction, runAction } from "../data/home-actions-requests";

export function HomeActionRunDialog({ action, onStarted, disabled }: { action: HomeAction; onStarted: () => void; disabled?: boolean }) {
  const { t } = useTranslation("home-actions");
  const [open, setOpen] = useState(false), [preview, setPreview] = useState<HomeActionPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [code, setCode] = useState(""), [key, setKey] = useState("");
  const change = (value: boolean) => {
    if (busy) return;
    setOpen(value); setCode(""); setError(null); setPreview(null);
    if (value) { setKey(crypto.randomUUID()); void previewAction(action.id).then(setPreview).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : t("failed"))); }
  };
  return <Dialog open={open} onOpenChange={change}><DialogTrigger asChild><Button disabled={disabled || action.publishedRevision !== action.revision}><PlayIcon />{t("run.start")}</Button></DialogTrigger><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{action.name}</DialogTitle><DialogDescription>{t("run.description")}</DialogDescription></DialogHeader><Stack gap="md">
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    {!preview && !error && <Text>{t("run.checking")}</Text>}
    {preview && <><Text weight="medium">{preview.ready ? t("run.ready") : t("run.blocked")}</Text>{preview.issues.map((issue) => <InlineAlert key={issue} tone="warning">{issue}</InlineAlert>)}<ol className="list-inside list-decimal space-y-2">{preview.alarmMode && <li>{t("run.alarm", { mode: t(`editor.arm${preview.alarmMode === "away" ? "Away" : "Home"}`) })}</li>}{preview.steps.map((step) => <li key={step.index}>{step.label}{step.alreadySatisfied ? ` · ${t("run.satisfied")}` : ""}</li>)}</ol></>}
    {action.alarmMode && <FormField htmlFor={`routine-code-${action.id}`} label={t("run.code")} description={t("run.codeHint")}><Input id={`routine-code-${action.id}`} type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} /></FormField>}
    <Button disabled={!preview?.ready} loading={busy} onClick={() => { setBusy(true); setError(null); void runAction(action, key, code || undefined).then(() => { setCode(""); setOpen(false); onStarted(); }).catch((failure: unknown) => { setCode(""); setError(failure instanceof Error ? failure.message : t("failed")); }).finally(() => setBusy(false)); }}>{t("run.confirm")}</Button>
  </Stack></DialogContent></Dialog>;
}
