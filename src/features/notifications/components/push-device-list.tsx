import { SmartphoneIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { currentLocale } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/types/date-format";
import type { PushDevice } from "../types/notifications";

type PushDeviceListProps = {
  devices: PushDevice[];
  /** This browser's endpoint, to mark "This device". */
  currentEndpoint: string | null;
  /** Returning the promise keeps the confirm dialog busy until it is done. */
  onRemove: (device: PushDevice) => Promise<unknown>;
};

/** The person's devices that get push notifications, with when the last one arrived and Remove. */
export function PushDeviceList({ devices, currentEndpoint, onRemove }: PushDeviceListProps) {
  const { t } = useTranslation("notifications");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  if (devices.length === 0) return <p className="text-sm text-muted-foreground">{t("devices.empty")}</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {devices.map((device) => {
        const mine = device.endpoint === currentEndpoint;
        return (
          <li key={device.id} className="flex items-center gap-3 px-3 py-2.5">
            <SmartphoneIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <span className="truncate">{device.label}</span>
                {mine && <Badge variant="secondary">{t("devices.thisDevice")}</Badge>}
                {device.failureCount > 0 && <Badge variant="destructive">{t("devices.failing", { count: device.failureCount })}</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">
                {device.lastSuccessAt
                  ? t("devices.lastDelivered", { date: formatDateTime(device.lastSuccessAt, locale) })
                  : t("devices.neverDelivered")}
                {" · "}
                {t("devices.added", { date: formatDate(device.createdAt, locale) })}
              </p>
            </div>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-lg" aria-label={`${t("devices.remove")}: ${device.label}`}>
                  <Trash2Icon />
                </Button>
              }
              title={t("devices.removeTitle", { name: device.label })}
              description={t("devices.removeDescription")}
              confirmLabel={t("devices.remove")}
              cancelLabel={tCommon("actions.cancel")}
              destructive
              onConfirm={() => onRemove(device)}
            />
          </li>
        );
      })}
    </ul>
  );
}
