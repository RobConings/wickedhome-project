import * as React from "react";
import { RotateCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoadFailedNoticeProps = {
  /** What failed, e.g. "The items could not load." */
  message: React.ReactNode;
  /** Loads again; the button spins until the promise settles. */
  onRetry: () => Promise<unknown>;
  className?: string;
};

/**
 * The first load of an embedded list or section failed: a dashed notice with a Retry button (instead of an
 * endless skeleton). For a whole page use `ErrorState`; for a compact panel use `InlineRetry`.
 */
export function LoadFailedNotice({ message, onRetry, className }: LoadFailedNoticeProps) {
  const { t } = useTranslation();
  const [retrying, setRetrying] = React.useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <span>{message}</span>
      <Button type="button" variant="outline" size="sm" loading={retrying} onClick={() => void retry()}>
        <RotateCwIcon />
        {t("actions.retry")}
      </Button>
    </div>
  );
}

type InlineRetryProps = {
  message: React.ReactNode;
  onRetry: () => void;
  /** Full-width button on phones (inside cards). */
  fullOnMobile?: boolean;
};

/** A panel that loads its own data failed: the message and a small Retry button under it. */
export function InlineRetry({ message, onRetry, fullOnMobile }: InlineRetryProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
      {message}
      <Button variant="outline" size="sm" fullOnMobile={fullOnMobile} onClick={onRetry}>
        {t("actions.retry")}
      </Button>
    </div>
  );
}
