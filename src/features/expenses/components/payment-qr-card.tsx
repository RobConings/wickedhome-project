import * as React from "react";
import { CopyIcon, DownloadIcon, QrCodeIcon, Share2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardTitle } from "@/components/shared/card";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { epcPayload } from "../types/payment-qr";
import type { Expense } from "../types/expenses";
import { formatIban, formatStructuredCommunication } from "../types/payment-references";

// The QR encoder is its own chunk, loaded only when a payment QR is shown.
const QrCode = React.lazy(() => import("@/components/shared/qr-code").then((module) => ({ default: module.QrCode })));

type PaymentQrCardProps = {
  expense: Pick<
    Expense,
    "payee" | "beneficiaryName" | "iban" | "bic" | "amountCents" | "structuredCommunication" | "reference"
  >;
};

/** A value people copy into their banking app, with a copy button. */
export function CopyableValue({ value, display, mono = true }: { value: string; display: string; mono?: boolean }) {
  const { t } = useTranslation("expenses");
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={mono ? "truncate font-mono" : "truncate"}>{display}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("actions.copy")}
        title={t("actions.copy")}
        onClick={() =>
          void navigator.clipboard
            .writeText(value)
            .then(() => toast.success(t("actions.copied")))
            .catch(() => undefined)
        }
      >
        <CopyIcon />
      </Button>
    </span>
  );
}

/** Whether this browser can hand an image to another app (the phone's share sheet). */
function canShareImages(): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "qr.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/**
 * On the phone itself the QR can't be scanned, so it goes to the banking app another way: "Open in banking
 * app" shares the code as an image (the details printed under it) through the share sheet; banking apps that
 * read invoices from a shared image or screenshot fill in the transfer. Without a share sheet the image is
 * saved instead. "Copy all" puts every detail on the clipboard at once.
 */
function PaymentQrActions({ payload, fileName, caption, copyText }: { payload: string; fileName: string; caption: string[]; copyText: string }) {
  const { t } = useTranslation("expenses");
  const [file, setFile] = React.useState<File | null>(null);
  const [shareable] = React.useState(canShareImages);
  const captionKey = caption.join("\n");

  // Made ahead of the tap: phones only open the share sheet straight from a tap, not after awaiting work.
  React.useEffect(() => {
    let current = true;
    import("@/components/shared/qr-png")
      .then(({ qrPngBlob }) => qrPngBlob(payload, { caption: captionKey.split("\n") }))
      .then((blob) => current && blob && setFile(new File([blob], fileName, { type: "image/png" })))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [payload, fileName, captionKey]);

  const share = () => {
    if (!file) return;
    navigator.share({ files: [file], title: fileName }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(t("qr.shareFailed"));
    });
  };

  const save = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyAll = () =>
    void navigator.clipboard
      .writeText(copyText)
      .then(() => toast.success(t("actions.copied")))
      .catch(() => undefined);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
      {shareable ? (
        <Button type="button" fullOnMobile disabled={!file} onClick={share}>
          <Share2Icon />
          {t("qr.openInApp")}
        </Button>
      ) : (
        <Button type="button" variant="outline" fullOnMobile disabled={!file} onClick={save}>
          <DownloadIcon />
          {t("qr.saveImage")}
        </Button>
      )}
      <Button type="button" variant="outline" fullOnMobile onClick={copyAll}>
        <CopyIcon />
        {t("qr.copyAll")}
      </Button>
    </div>
  );
}

/**
 * Pay by transfer: the SEPA payment QR code (EPC069-12) for banking apps, plus IBAN, amount and
 * communication with copy buttons, and a way to pay from the same phone (see `PaymentQrActions`).
 * Without an IBAN it says what's missing.
 */
export function PaymentQrCard({ expense }: PaymentQrCardProps) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  const name = expense.beneficiaryName || expense.payee;
  const payload = epcPayload({ ...expense, beneficiaryName: name });
  const communication = expense.structuredCommunication
    ? formatStructuredCommunication(expense.structuredCommunication)
    : expense.reference;
  const amountText = (expense.amountCents / 100).toFixed(2).replace(".", ",");

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <QrCodeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        {t("qr.title")}
      </CardTitle>
      {payload ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("qr.description")}</p>
          <React.Suspense fallback={<Skeleton className="mx-auto aspect-square w-full max-w-56" aria-label={t("qr.loading")} />}>
            <QrCode value={payload} label={t("qr.label", { payee: name })} className="mx-auto w-full max-w-56" />
          </React.Suspense>
          <PaymentQrActions
            payload={payload}
            fileName={t("qr.fileName", { payee: name })}
            caption={[name, expense.iban ? formatIban(expense.iban) : "", formatCurrency(expense.amountCents, locale), communication ?? ""].filter(Boolean)}
            copyText={[
              `${t("fields.beneficiaryName")}: ${name}`,
              expense.iban && `${t("fields.iban")}: ${formatIban(expense.iban)}`,
              `${t("fields.amount")}: ${amountText}`,
              communication && `${t("fields.communication")}: ${communication}`,
            ]
              .filter(Boolean)
              .join("\n")}
          />
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("fields.beneficiaryName")}</dt>
            <dd className="truncate">{name}</dd>
            <dt className="text-muted-foreground">{t("fields.iban")}</dt>
            <dd>{expense.iban && <CopyableValue value={expense.iban} display={formatIban(expense.iban)} />}</dd>
            <dt className="text-muted-foreground">{t("fields.amount")}</dt>
            <dd>
              <CopyableValue value={amountText} display={formatCurrency(expense.amountCents, locale)} mono={false} />
            </dd>
            {communication && (
              <>
                <dt className="text-muted-foreground">{t("fields.communication")}</dt>
                <dd>
                  <CopyableValue value={communication} display={communication} />
                </dd>
              </>
            )}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("qr.missing")}</p>
      )}
    </Card>
  );
}
