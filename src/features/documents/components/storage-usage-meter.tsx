import { HardDriveIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StorageUsage } from "../types/documents";
import { fileSize } from "./document-format";

type StorageUsageMeterProps = {
  /** `undefined` while it is still loading: a skeleton of the same size is shown. */
  usage: StorageUsage | undefined;
  /** Loading failed (and there is no older value): shows a short message instead of the skeleton. */
  failed?: boolean;
  /** Offered as "Try again" when `failed`. */
  onRetry?: () => void;
  className?: string;
};

const cardClass = "flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm shadow-xs";

/** How much the drive holds, and how full the server's disk is. */
export function StorageUsageMeter({ usage, failed = false, onRetry, className }: StorageUsageMeterProps) {
  const { t } = useTranslation("documents");
  const { t: tCommon } = useTranslation();

  const title = (
    <div className="flex items-center gap-2 font-medium">
      <HardDriveIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      {t("usage.title")}
    </div>
  );

  if (!usage) {
    return failed ? (
      <div className={cn(cardClass, className)}>
        {title}
        <p className="text-xs text-muted-foreground">{t("usage.failed")}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
            {tCommon("actions.retry")}
          </Button>
        )}
      </div>
    ) : (
      <div className={cn(cardClass, className)} role="status" aria-label={t("loading.usage")}>
        {title}
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const total = usage.diskTotalBytes;
  const free = usage.diskFreeBytes;
  const documentsShare = total ? Math.min(1, (usage.usedBytes + usage.trashBytes) / total) : 0;
  const otherShare = total && free !== null ? Math.max(0, 1 - free / total - documentsShare) : 0;
  const lowSpace = total !== null && free !== null && free / total < 0.1;

  return (
    <div className={cn(cardClass, className)}>
      {title}
      <p>
        <span className="font-semibold tabular-nums">{fileSize(usage.usedBytes)}</span>{" "}
        <span className="text-muted-foreground">{t("usage.files", { count: usage.fileCount })}</span>
      </p>
      {total !== null && free !== null && (
        <>
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={t("usage.disk")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={total - free}
          >
            <div className="h-full bg-primary" style={{ width: `${Math.max(documentsShare * 100, usage.usedBytes ? 1 : 0)}%` }} />
            <div className="h-full bg-muted-foreground/40" style={{ width: `${otherShare * 100}%` }} />
          </div>
          <p className={cn("text-xs", lowSpace ? "font-medium text-destructive" : "text-muted-foreground")}>
            {t("usage.free", { free: fileSize(free), total: fileSize(total) })}
          </p>
        </>
      )}
      {usage.trashBytes > 0 && (
        <p className="text-xs text-muted-foreground">{t("usage.trash", { size: fileSize(usage.trashBytes) })}</p>
      )}
    </div>
  );
}
