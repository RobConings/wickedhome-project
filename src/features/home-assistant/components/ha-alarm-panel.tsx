import { useAsyncResource } from "@/lib/use-async-resource";
import { useTranslation } from "react-i18next";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
import { fetchAlarmOverview } from "../data/home-assistant-requests";
import { AlarmCard } from "./alarm-card";
import type { AlarmOverview } from "../types/home-assistant";
export function HaAlarmPanel({ canControl, initial }: { canControl: boolean; initial?: AlarmOverview | null }) {
  const { t } = useTranslation("home-assistant");
  const resource = useAsyncResource("ha-alarm-panel", fetchAlarmOverview, initial === undefined ? {} : { initial });
  if (resource.error) return <InlineAlert tone="error">{t("alarm.errors.unavailable")}<Button variant="outline" onClick={resource.refresh}>{t("controls.retry")}</Button></InlineAlert>;
  return <AlarmCard overview={resource.data ?? null} canControl={canControl} />;
}
