import { CircleAlertIcon, CircleCheckIcon, CircleSlashIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeIcon } from "@/components/shared/file-type-icon";
import { cn } from "@/lib/utils";
import type { UploadItem } from "../data/use-document-uploads";
import { fileSize } from "./document-format";

type UploadProgressListProps = {
  items: UploadItem[];
  onCancel: (key: string) => void;
  /** Cancels every queued and running upload; offered as "Cancel all" while more than one is going. */
  onCancelAll?: () => void;
  /** Removes finished, failed and cancelled items. */
  onClear: () => void;
  className?: string;
};

const isActive = (item: UploadItem) => item.status === "queued" || item.status === "uploading";

/**
 * The upload queue: "Uploading 2 of 5…" with an overall bar, then one row per file with its own bar,
 * bytes and percentage, and cancel while it is still going. At the end a summary (uploaded, failed,
 * cancelled) stays until it is cleared.
 */
export function UploadProgressList({ items, onCancel, onCancelAll, onClear, className }: UploadProgressListProps) {
  const { t } = useTranslation("documents");
  if (items.length === 0) return null;

  const active = items.filter(isActive).length;
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;
  const cancelled = items.filter((item) => item.status === "cancelled").length;
  const settled = items.length - active;

  // Overall progress by bytes, over the files that are (or were) actually being uploaded.
  const counted = items.filter((item) => isActive(item) || item.status === "done");
  const totalBytes = counted.reduce((sum, item) => sum + item.sizeBytes, 0);
  const loadedBytes = counted.reduce((sum, item) => sum + item.sizeBytes * item.progress, 0);
  const overall = totalBytes ? (loadedBytes / totalBytes) * 100 : 0;

  const summary =
    active > 0
      ? t("upload.progress", { current: Math.min(items.length, settled + 1), total: items.length, count: items.length })
      : [
          t("upload.finished", { count: done }),
          failed > 0 && t("upload.failedCount", { count: failed }),
          cancelled > 0 && t("upload.cancelledCount", { count: cancelled }),
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <section
      aria-label={t("upload.title")}
      className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs", className)}
    >
      <div className="flex flex-col gap-2 px-1">
        <div className="flex min-h-8 items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-sm font-medium" aria-live="polite">
            {active > 0 ? (
              <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
            ) : failed > 0 ? (
              <CircleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            ) : done > 0 ? (
              <CircleCheckIcon className="size-4 shrink-0 text-success" aria-hidden="true" />
            ) : null}
            <span className="truncate">{summary}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {active > 1 && onCancelAll && (
              <Button variant="ghost" size="sm" onClick={onCancelAll}>
                {t("upload.cancelAll")}
              </Button>
            )}
            {active === 0 && (
              <Button variant="ghost" size="sm" onClick={onClear}>
                {t("upload.clear")}
              </Button>
            )}
          </div>
        </div>
        {active > 0 && items.length > 1 && (
          <div className="flex items-center gap-3">
            <Progress value={overall} label={t("upload.overall")} className="h-1.5" />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {t("upload.bytes", { loaded: fileSize(loadedBytes), total: fileSize(totalBytes) })}
            </span>
          </div>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
            <FileTypeIcon mimeType={item.mimeType} name={item.name} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {item.status === "uploading" ? `${Math.round(item.progress * 100)}%` : fileSize(item.sizeBytes)}
                </span>
              </div>
              {item.status === "error" || item.status === "cancelled" ? (
                <span className={cn("text-xs", item.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {item.status === "error" ? item.error : t("upload.cancelled")}
                </span>
              ) : (
                <>
                  <Progress
                    value={item.progress * 100}
                    label={item.name}
                    className={cn("h-1.5", item.status === "done" && "[&>div]:bg-success")}
                  />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {item.status === "queued"
                      ? t("upload.waiting")
                      : item.status === "done"
                        ? t("upload.done")
                        : t("upload.bytes", {
                            loaded: fileSize(item.sizeBytes * item.progress),
                            total: fileSize(item.sizeBytes),
                          })}
                  </span>
                </>
              )}
            </div>
            <StatusIcon item={item} onCancel={onCancel} cancelLabel={t("upload.cancel", { name: item.name })} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusIcon({ item, onCancel, cancelLabel }: { item: UploadItem; onCancel: (key: string) => void; cancelLabel: string }) {
  if (isActive(item)) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label={cancelLabel} title={cancelLabel} onClick={() => onCancel(item.key)}>
        <XIcon />
      </Button>
    );
  }
  const Icon = item.status === "done" ? CircleCheckIcon : item.status === "error" ? CircleAlertIcon : CircleSlashIcon;
  return (
    <span className="grid size-8 shrink-0 place-items-center">
      <Icon
        className={cn(
          "size-4",
          item.status === "done" ? "text-success" : item.status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
    </span>
  );
}
