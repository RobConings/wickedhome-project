import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Card, CardTitle } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { formatDateTime } from "@/types/date-format";
import { currentLocale } from "@/lib/i18n";
import type { HomeActionRun } from "../types/home-actions";
import { stopActionRun } from "../data/home-actions-requests";
export function HomeActionHistory({ runs, canManage, onChanged }: { runs: HomeActionRun[]; canManage: boolean; onChanged: () => void }) {
  const { t } = useTranslation("home-actions"), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null);
  return <Card><CardTitle>{t("history.title")}</CardTitle>{error && <InlineAlert tone="error">{error}</InlineAlert>}{!runs.length && <Text tone="muted">{t("history.empty")}</Text>}<Stack gap="sm">{runs.map((run) => <Stack key={run.id} gap="xs" className="border-b py-3 last:border-b-0"><Inline justify="between" wrap><Text weight="medium">{run.name}</Text><Text>{t(`statuses.${run.status}`, { defaultValue: run.status })}</Text></Inline><Text size="sm" tone="muted">{run.actorName} · {formatDateTime(run.startedAt, currentLocale())} · v{run.revision}</Text>{run.detail && <Text size="sm">{run.detail}</Text>}<details><summary className="min-h-10 cursor-pointer py-2">{t("history.steps")}</summary><ol className="list-inside list-decimal space-y-1">{run.steps.sort((a, b) => a.index - b.index).map((step) => <li key={step.index}>{t("history.step", { number: step.index + 1 })}: {t(`statuses.${step.status}`)}</li>)}</ol></details>{canManage && ["requested", "running", "arming"].includes(run.status) && <Button variant="outline" loading={busy === run.id} onClick={() => { setBusy(run.id); setError(null); void stopActionRun(run.id).then(onChanged).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : t("failed"))).finally(() => setBusy(null)); }}>{t("history.stop")}</Button>}</Stack>)}</Stack></Card>;
}
