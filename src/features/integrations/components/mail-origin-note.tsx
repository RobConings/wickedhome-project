import { MailIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MailDocumentOrigin } from "../types/mail-matching";
import { dateText } from "@/lib/locale-text";

/** "From mail on 02/10/2026" next to a document that came from a mail bill (accepted or linked). */
export function MailOriginNote({ origin }: { origin: MailDocumentOrigin }) {
  const { t } = useTranslation("integrations");
  return (
    <span className="inline-flex items-center gap-1" title={origin.payee}>
      <MailIcon className="size-3 shrink-0" aria-hidden="true" />
      {t("link.fromMail", { date: dateText(origin.receivedAt) })}
    </span>
  );
}
