import * as React from "react";
import { PencilIcon, ShieldAlertIcon, ShieldQuestionIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AssistantConfirmOptions, AssistantPreviewPayload, AssistantToolPermission } from "../types/assistant";
import { AssistantPreview } from "./previews/assistant-preview";

/** What the person changed or picked on the card, sent with Confirm. */
export type ConfirmationExtra = { edits?: Record<string, string>; choice?: string };

type ConfirmationCardProps = {
  /** What will happen, in the person's language: "Put 2 × milk on the shopping list". */
  summary: string;
  /** What the change looks like (a list, fields, a plan diff…), when the tool can show it. */
  preview?: AssistantPreviewPayload | null;
  /** Editable arguments and choice buttons (a tool's `confirmation`); absent: Confirm / Cancel only. */
  options?: AssistantConfirmOptions | null;
  permission: AssistantToolPermission;
  /** Offer "Don't ask again" (harmless writes only). */
  allowRemember: boolean;
  /** The decision being sent. */
  submitting?: "confirm" | "cancel" | null;
  /** Something else is busy (an answer streaming): buttons wait. */
  disabled?: boolean;
  onDecide: (decision: "confirm" | "cancel", remember: boolean, extra?: ConfirmationExtra) => void;
  className?: string;
};

/**
 * A change the assistant wants to make, waiting for the person: what will happen, Confirm / Cancel, and for
 * harmless actions "Don't ask again". Tools with `confirmation` options get an Edit button (the preview shows
 * inputs for the editable arguments) and/or choice buttons instead of Confirm ("Send", "Save as draft").
 * Voice never answers this card; it always needs a tap.
 */
export function ConfirmationCard({ summary, preview = null, options = null, permission, allowRemember, submitting = null, disabled = false, onDecide, className }: ConfirmationCardProps) {
  const { t } = useTranslation("assistant");
  const [remember, setRemember] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [picked, setPicked] = React.useState<string | null>(null);
  const id = React.useId();
  const sensitive = permission === "sensitive";
  const Icon = sensitive ? ShieldAlertIcon : ShieldQuestionIcon;
  const busy = submitting !== null;
  const editable = options?.editable ?? [];
  const choices = options?.choices ?? [];
  const edit = editable.length
    ? { editing, editable, values: edits, onChange: (field: string, value: string) => setEdits((previous) => ({ ...previous, [field]: value })) }
    : undefined;
  const extra = (choice?: string): ConfirmationExtra => ({ ...(Object.keys(edits).length && { edits }), ...(choice && { choice }) });

  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      className={cn("flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs sm:p-4", sensitive && "border-warning/50", className)}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 size-5 shrink-0", sensitive ? "text-warning" : "text-primary")} aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p id={`${id}-title`} className="text-xs font-medium text-muted-foreground">
            {sensitive ? t("confirm.sensitiveTitle") : t("confirm.title")}
          </p>
          <p className="text-sm font-medium text-pretty">{summary}</p>
        </div>
      </div>
      {preview && <AssistantPreview preview={preview} edit={edit} />}
      {allowRemember && (
        <div className="flex items-center gap-2">
          <Switch id={`${id}-remember`} checked={remember} onCheckedChange={setRemember} disabled={busy || disabled} />
          <Label htmlFor={`${id}-remember`} className="text-sm font-normal">
            {t("confirm.remember")}
          </Label>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {editable.length > 0 && preview && (
          <Button variant="ghost" className="min-h-10 flex-1 sm:mr-auto sm:flex-none" aria-pressed={editing} disabled={busy || disabled} onClick={() => setEditing((value) => !value)}>
            <PencilIcon />
            {editing ? t("confirm.doneEditing") : t("confirm.edit")}
          </Button>
        )}
        <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" disabled={busy || disabled} loading={submitting === "cancel"} onClick={() => onDecide("cancel", false)}>
          {t("confirm.cancel")}
        </Button>
        {choices.length > 0 ? (
          choices.map((choice, index) => (
            <Button
              key={choice.value}
              variant={index === 0 ? "default" : "outline"}
              className="min-h-10 flex-1 sm:flex-none"
              disabled={busy || disabled}
              loading={submitting === "confirm" && picked === choice.value}
              onClick={() => {
                setPicked(choice.value);
                onDecide("confirm", remember, extra(choice.value));
              }}
            >
              {choice.label}
            </Button>
          ))
        ) : (
          <Button className="min-h-10 flex-1 sm:flex-none" disabled={busy || disabled} loading={submitting === "confirm"} onClick={() => onDecide("confirm", remember, extra())}>
            {t("confirm.confirm")}
          </Button>
        )}
      </div>
    </div>
  );
}
