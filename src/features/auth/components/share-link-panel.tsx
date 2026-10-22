import * as React from "react";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/layout/stack";
import { currentLocale } from "@/lib/i18n";
import { formatDateTime } from "@/types/date-format";
import type { LinkKind } from "../types/accounts";

// The QR encoder is only needed once a link exists: its own chunk, loaded on first use.
const LinkQrCode = React.lazy(() => import("./link-qr-code").then((module) => ({ default: module.LinkQrCode })));

type ShareLinkPanelProps = {
  /** The full link (`window.location.origin` + path). */
  url: string;
  kind: LinkKind;
  /** Who the link is for, used in the share text. */
  personName: string;
  householdName: string;
  /** ISO timestamp. */
  expiresAt: string;
};

/** Copies with the Clipboard API, or with a selected input where that isn't available (plain http on the LAN). */
async function copyText(text: string, input: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!input) return false;
    input.select();
    return document.execCommand("copy");
  }
}

/**
 * A fresh invite or reset link, ready to hand over: a QR code to scan from this screen, the link with a
 * copy button and, on phones, the share sheet (straight into WhatsApp).
 */
export function ShareLinkPanel({ url, kind, personName, householdName, expiresAt }: ShareLinkPanelProps) {
  const { t } = useTranslation("auth");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [copied, setCopied] = React.useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const prefix = kind === "invite" ? "share.invite" : "share.reset";

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (await copyText(url, inputRef.current)) {
      setCopied(true);
      toast.success(t("share.copied"));
    } else {
      toast.error(t("share.copyFailed"));
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: t(`${prefix}.title`, { household: householdName }),
        text: t(`${prefix}.text`, { name: personName, household: householdName }),
        url,
      });
    } catch (error) {
      // Closing the share sheet is not an error.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(t("share.shareFailed"));
    }
  }

  return (
    <Stack gap="md" className="min-w-0">
      <div className="mx-auto w-full max-w-56">
        <React.Suspense fallback={<Skeleton className="aspect-square w-full rounded-lg" aria-label={t("share.qrLoading")} />}>
          <LinkQrCode value={url} label={t("share.qrLabel", { name: personName })} className="aspect-square w-full border" />
        </React.Suspense>
      </div>
      <p className="text-center text-sm text-muted-foreground">{t(`${prefix}.scanHint`, { name: personName })}</p>
      <div className="flex min-w-0 gap-2">
        <Input
          ref={inputRef}
          readOnly
          value={url}
          aria-label={t("share.link")}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 font-mono text-xs md:text-xs"
        />
        <Button type="button" variant="outline" size="lg" onClick={() => void copy()} className="shrink-0">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? t("share.copiedShort") : t("share.copy")}
        </Button>
      </div>
      {canShare && (
        <Button type="button" size="lg" onClick={() => void share()}>
          <Share2Icon />
          {t("share.share")}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {t(`${prefix}.expires`, {
          date: formatDateTime(expiresAt, currentLocale()),
        })}{" "}
        {t("share.once")}
      </p>
    </Stack>
  );
}
