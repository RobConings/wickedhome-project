import * as React from "react";
import { FolderKanbanIcon, PaperclipIcon, ReplyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantPreviewRendererProps } from "@/features/assistant";
import { MAIL_BODY_MAX, MAIL_SUBJECT_MAX, mailPreviewDataSchema } from "../types/mail";

const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);

/**
 * The confirmation card of a mail the assistant wrote (`kind: "mail"`, ai/skills/mail): From, To, Cc,
 * Subject, the message and attachments. While the person edits on the card, subject and message become
 * inputs; the card sends the changes with Send / Save as draft and the server checks them again.
 */
export function MailComposePreview({ preview, edit }: AssistantPreviewRendererProps) {
  const { t } = useTranslation("integrations");
  const id = React.useId();
  const parsed = mailPreviewDataSchema.safeParse(preview.data);
  if (!parsed.success) return <p className="text-sm text-muted-foreground">{t("mail.preview.invalid")}</p>;
  const mail = parsed.data;
  const editing = Boolean(edit?.editing);
  const canEdit = (field: "subject" | "body") => editing && Boolean(edit?.editable.includes(field));
  const subject = edit?.values.subject ?? mail.subject;
  const body = edit?.values.body ?? mail.body;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex min-w-0 gap-2 text-sm">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {mail.replyTo && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ReplyIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{t("mail.preview.replyTo", { subject: mail.replyTo })}</span>
        </p>
      )}
      {mail.from && row(t("mail.preview.from"), mail.from)}
      {row(t("mail.preview.to"), mail.to.join(", "))}
      {mail.cc.length > 0 && row(t("mail.preview.cc"), mail.cc.join(", "))}
      {canEdit("subject") ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-subject`} className="text-xs text-muted-foreground">
            {t("mail.preview.subject")}
          </Label>
          <Input id={`${id}-subject`} value={subject} maxLength={MAIL_SUBJECT_MAX} onChange={(event) => edit?.onChange("subject", event.target.value)} />
        </div>
      ) : (
        row(t("mail.preview.subject"), <span className="font-medium">{subject}</span>)
      )}
      {canEdit("body") ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-body`} className="text-xs text-muted-foreground">
            {t("mail.preview.body")}
          </Label>
          <Textarea id={`${id}-body`} value={body} maxLength={MAIL_BODY_MAX} rows={Math.min(14, Math.max(5, body.split("\n").length + 1))} onChange={(event) => edit?.onChange("body", event.target.value)} />
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-md border bg-background p-2.5 text-sm whitespace-pre-wrap break-words" aria-label={t("mail.preview.body")}>
          {body}
        </div>
      )}
      {mail.attachments.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label={t("mail.preview.attachments")}>
          {mail.attachments.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-1.5">
              <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{size(file.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
      {mail.project && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderKanbanIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{t("mail.preview.project", { project: mail.project })}</span>
        </p>
      )}
    </div>
  );
}
