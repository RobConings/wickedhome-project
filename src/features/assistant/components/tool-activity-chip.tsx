import { BanIcon, CheckIcon, CircleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { AssistantToolStatus } from "../types/assistant";

type ToolActivityChipProps = {
  label: string;
  status: AssistantToolStatus | "running";
  /** Why it failed, shown under the chip. */
  error?: string | null;
  className?: string;
};

/** What the assistant did, as a small chip in the chat: "Checked the shopping list". */
export function ToolActivityChip({ label, status, error, className }: ToolActivityChipProps) {
  const { t } = useTranslation("assistant");
  const text =
    status === "running" || status === "pending"
      ? t("tool.running", { label })
      : status === "failed"
        ? t("tool.failed", { label })
        : status === "cancelled"
          ? t("tool.cancelled", { label })
          : label;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs",
          status === "done" && "border-success/30 bg-success/10",
          status === "failed" && "border-destructive/30 bg-destructive/10",
          (status === "cancelled" || status === "running" || status === "pending") && "bg-muted text-muted-foreground",
        )}
      >
        {status === "running" || status === "pending" ? (
          <Spinner className="size-3" />
        ) : status === "done" ? (
          <CheckIcon className="size-3 text-success" aria-hidden />
        ) : status === "failed" ? (
          <CircleAlertIcon className="size-3 text-destructive" aria-hidden />
        ) : (
          <BanIcon className="size-3" aria-hidden />
        )}
        <span className="truncate">{text}</span>
      </span>
      {status === "failed" && error && <span className="pl-2 text-xs text-muted-foreground">{t("tool.error", { error })}</span>}
    </div>
  );
}
