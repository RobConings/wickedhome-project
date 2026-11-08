import { useState } from "react";
import { PlayIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchHaScenes, runHaScene } from "../data/home-assistant-requests";

export function HaScenesPanel({ initial }: { initial?: { entityId: string; name: string }[] }) {
  const { t } = useTranslation("home-assistant");
  const resource = useAsyncResource("ha-scenes", fetchHaScenes, { initial });
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  return <Card id="ha-scenes" className="scroll-mt-20"><CardTitle><SparklesIcon className="mr-2 inline size-5 text-section" />{t("controls.scenes")}</CardTitle>
    <CardDescription>{t("controls.scenesHint")}</CardDescription>
    {(failed || resource.error) && <InlineAlert tone="error">{t("controls.failed")}</InlineAlert>}
    {resource.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("controls.noScenes")}</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{resource.data?.map((scene) => <Button key={scene.entityId} variant="outline" className="h-auto min-h-14 justify-start whitespace-normal text-left" disabled={busy}
      onClick={async () => { setBusy(true); setFailed(false); try { await runHaScene(scene.entityId); } catch { setFailed(true); } finally { setBusy(false); } }}><PlayIcon />{scene.name}</Button>)}</div>
  </Card>;
}
