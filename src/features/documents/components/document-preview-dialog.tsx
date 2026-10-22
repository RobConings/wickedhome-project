import * as React from "react";
import { CircleAlertIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FileTypeIcon } from "@/components/shared/file-type-icon";
import { LoadingState } from "@/components/shared/loading-state";
import { cn } from "@/lib/utils";
import { documentContentUrl, previewKind, type DocumentFile } from "../types/documents";
import { fileSize, shortDate } from "./document-format";

/** What the dialog needs of a file: a document, or a file elsewhere (a linked Drive folder) shown through `src`. */
export type PreviewFile = Pick<DocumentFile, "id" | "name" | "mimeType"> &
  Partial<Pick<DocumentFile, "uploadedAt">> & { sizeBytes?: number | null; uploadedBy?: { name: string } | null };

type DocumentPreviewDialogProps = {
  /** The file to show; `null` closes the dialog. */
  file: PreviewFile | null;
  onOpenChange: (open: boolean) => void;
  /** Use this URL instead of the API's (stories, files of a linked Drive folder). */
  src?: string;
  /** Download URL that goes with `src`; without it the download uses `src`. */
  downloadSrc?: string;
  /** Text to show instead of fetching it (stories). */
  text?: string;
};

/** First this many bytes of a text file are shown. */
const TEXT_PREVIEW_BYTES = 64 * 1024;

/** Shows an image, PDF, video or the start of a text file in a dialog, with download and open-in-tab. */
export function DocumentPreviewDialog({ file, onOpenChange, src, downloadSrc, text }: DocumentPreviewDialogProps) {
  const { t } = useTranslation("documents");
  const url = file ? (src ?? documentContentUrl(file.id)) : "";
  const kind = file ? previewKind(file.mimeType) : "none";

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-4xl">
        {file && (
          <>
            <DialogHeader className="pr-8">
              <div className="flex min-w-0 items-center gap-3">
                <FileTypeIcon mimeType={file.mimeType} name={file.name} />
                <div className="flex min-w-0 flex-col gap-0.5 text-left">
                  <DialogTitle className="truncate">{file.name}</DialogTitle>
                  <DialogDescription className="truncate">
                    {[
                      typeof file.sizeBytes === "number" && fileSize(file.sizeBytes),
                      file.uploadedAt && shortDate(file.uploadedAt),
                      file.uploadedBy && t("preview.uploadedBy", { name: file.uploadedBy.name }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40">
              {(kind === "image" || kind === "pdf" || kind === "video" || kind === "audio") && (
                <MediaPreview key={`${file.id}-${url}`} kind={kind} url={url} name={file.name} />
              )}
              {kind === "text" && <TextPreview key={file.id} url={url} text={text} />}
              {kind === "none" && (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <FileTypeIcon mimeType={file.mimeType} name={file.name} size="lg" />
                  <p className="text-sm text-muted-foreground">{t("preview.unavailable")}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {kind !== "none" && (
                <Button variant="outline" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon />
                    {t("actions.openInTab")}
                  </a>
                </Button>
              )}
              <Button asChild>
                <a href={downloadSrc ?? src ?? documentContentUrl(file.id, { download: true })} download={file.name}>
                  <DownloadIcon />
                  {t("actions.download")}
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type MediaKind = "image" | "pdf" | "video" | "audio";

/**
 * An image or PDF with a spinner until the browser has it, and a message instead when it can't be loaded.
 * Video and audio keep their own player's loading state; only a failure replaces them.
 */
function MediaPreview({ kind, url, name }: { kind: MediaKind; url: string; name: string }) {
  const { t } = useTranslation("documents");
  const [status, setStatus] = React.useState<"loading" | "ready" | "failed">(
    kind === "image" || kind === "pdf" ? "loading" : "ready",
  );
  const onLoad = () => setStatus((current) => (current === "failed" ? current : "ready"));
  const onError = () => setStatus("failed");

  // A frame has no error event (a 404 just shows the error page): ask the server first whether the file is there.
  React.useEffect(() => {
    if (kind !== "pdf" || !/^(\/|https?:)/.test(url)) return;
    const controller = new AbortController();
    fetch(url, { method: "HEAD", credentials: "same-origin", signal: controller.signal })
      .then((response) => {
        if (!response.ok) setStatus("failed");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("failed");
      });
    return () => controller.abort();
  }, [kind, url]);

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="alert">
        <CircleAlertIcon className="size-8 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("preview.failed")}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-40" aria-busy={status === "loading" || undefined}>
      {kind === "image" && (
        <img
          src={url}
          alt={name}
          onLoad={onLoad}
          onError={onError}
          className={cn("mx-auto max-h-[70dvh] object-contain", status === "loading" && "opacity-0")}
        />
      )}
      {kind === "pdf" && (
        <iframe src={url} title={name} onLoad={onLoad} className="h-[70dvh] w-full rounded-lg bg-background" />
      )}
      {kind === "video" && <video src={url} controls onError={onError} className="mx-auto max-h-[70dvh] w-full" />}
      {kind === "audio" && <audio src={url} controls onError={onError} className="m-6 w-[calc(100%-3rem)]" />}
      {status === "loading" && (
        <LoadingState label={t("preview.loading")} className="absolute inset-0 z-10 min-h-0 bg-muted/40" />
      )}
    </div>
  );
}

/** Fetches only the start of the file (Range request), so a large CSV doesn't stall the dialog. */
function TextPreview({ url, text }: { url: string; text?: string }) {
  const { t } = useTranslation("documents");
  const [state, setState] = React.useState<{ text?: string; truncated?: boolean; failed?: boolean }>(
    text !== undefined ? { text } : {},
  );

  React.useEffect(() => {
    if (text !== undefined) return;
    const controller = new AbortController();
    fetch(url, {
      credentials: "same-origin",
      headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.text();
        setState({ text: body, truncated: response.status === 206 && body.length >= TEXT_PREVIEW_BYTES - 4 });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ failed: true });
      });
    return () => controller.abort();
  }, [url, text]);

  if (state.failed) return <p className="p-6 text-sm text-muted-foreground">{t("preview.failed")}</p>;
  if (state.text === undefined) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  return (
    <div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed whitespace-pre">{state.text}</pre>
      {state.truncated && <p className="border-t px-4 py-2 text-xs text-muted-foreground">{t("preview.truncated")}</p>}
    </div>
  );
}
