import * as React from "react";
import { DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PdfPages } from "./pdf-pages";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate } from "@/types/date-format";
import { googleClient, type GoogleClient } from "../data/google-client";
import { mailSuggestionPdfUrl, type MailBillSuggestion, type MailBillSuggestionMail } from "../types/google";

type MailSuggestionPreviewDialogProps = {
  /** The suggestion to show; `null` closes the dialog. */
  suggestion: MailBillSuggestion | null;
  onOpenChange: (open: boolean) => void;
  /** The actions under the preview (Accept, Link…), so the person acts right after checking. */
  actions?: React.ReactNode;
  client?: Pick<GoogleClient, "suggestionText">;
  /** Stories: the mail text instead of the API, and a PDF URL instead of the mailbox's. */
  initialMail?: MailBillSuggestionMail;
  pdfSrc?: string;
};

/**
 * Check a mail suggestion before accepting it: what was found (amount, due date, payment details) next to the
 * mail's text and its PDF, both read from the mailbox again. The PDF is drawn in the app (`PdfPages`), not in
 * a frame or a new tab: on phones those open outside the app, without its login. Phones stack everything.
 */
export function MailSuggestionPreviewDialog({ suggestion, onOpenChange, actions, client = googleClient, initialMail, pdfSrc }: MailSuggestionPreviewDialogProps) {
  const { t } = useTranslation("integrations");
  const locale = currentLocale();
  const pdfUrl = suggestion ? (pdfSrc ?? mailSuggestionPdfUrl(suggestion.id)) : "";

  return (
    <Dialog open={suggestion !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-5xl">
        {suggestion && (
          <>
            <DialogHeader className="pr-8 text-left">
              <DialogTitle className="truncate">{suggestion.payee}</DialogTitle>
              <DialogDescription className="truncate">
                {t("suggestions.received", { date: formatDate(suggestion.receivedAt, locale) })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:overflow-hidden">
              <div className="flex min-h-0 flex-col gap-4">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg border p-3 text-sm">
                  <Found label={t("preview.amount")} value={suggestion.amountCents !== null ? formatCurrency(suggestion.amountCents, locale) : null} />
                  <Found label={t("preview.dueDate")} value={suggestion.dueDate ? formatDate(suggestion.dueDate, locale) : null} />
                  <Found label={t("preview.reference")} value={suggestion.structuredCommunication ? formatReference(suggestion.structuredCommunication) : null} />
                  <Found label={t("preview.iban")} value={suggestion.iban} />
                </dl>
                <section aria-labelledby="mail-preview-text" className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <h3 id="mail-preview-text" className="text-sm font-medium">
                    {t("preview.text")}
                  </h3>
                  <MailText key={suggestion.id} id={suggestion.id} client={client} initial={initialMail} />
                </section>
              </div>

              <section aria-labelledby="mail-preview-pdf" className="flex min-h-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 id="mail-preview-pdf" className="truncate text-sm font-medium">
                    {suggestion.attachmentName ?? t("preview.pdf")}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => void downloadPdf(pdfUrl, suggestion.attachmentName ?? `${suggestion.payee}.pdf`)}>
                    <DownloadIcon />
                    {t("preview.downloadPdf")}
                  </Button>
                </div>
                <div className="h-[60dvh] min-h-64 overflow-y-auto overscroll-contain rounded-lg border bg-muted/40 lg:h-auto lg:flex-1">
                  <PdfPages key={pdfUrl} url={pdfUrl} title={suggestion.attachmentName ?? t("preview.pdf")} />
                </div>
              </section>
            </div>

            {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Found({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("integrations");
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words tabular-nums", value === null && "text-muted-foreground")}>{value ?? t("preview.notFound")}</dd>
    </>
  );
}

/** `123456789012` → `+++123/4567/89012+++`, as on Belgian transfer forms. */
const formatReference = (digits: string) => (/^\d{12}$/.test(digits) ? `+++${digits.slice(0, 3)}/${digits.slice(3, 7)}/${digits.slice(7)}+++` : digits);

/** The mail's body as plain text, fetched when the dialog opens. */
function MailText({ id, client, initial }: { id: string; client: Pick<GoogleClient, "suggestionText">; initial?: MailBillSuggestionMail }) {
  const { t } = useTranslation("integrations");
  const [state, setState] = React.useState<{ mail?: MailBillSuggestionMail; failed?: boolean }>(initial ? { mail: initial } : {});

  React.useEffect(() => {
    if (initial) return;
    let cancelled = false;
    client
      .suggestionText(id)
      .then((mail) => !cancelled && setState({ mail }))
      .catch(() => !cancelled && setState({ failed: true }));
    return () => {
      cancelled = true;
    };
  }, [client, id, initial]);

  if (state.failed) return <p className="rounded-lg border p-3 text-sm text-muted-foreground">{t("preview.textFailed")}</p>;
  if (!state.mail) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-3" aria-busy="true">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  return (
    <div className="min-h-24 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed break-words whitespace-pre-wrap lg:flex-1">
      {state.mail.text || <span className="text-muted-foreground">{t("preview.noText")}</span>}
    </div>
  );
}

/** Saves the PDF through the app's own session (a link would open outside the installed app on phones). */
async function downloadPdf(url: string, name: string) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) return;
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
