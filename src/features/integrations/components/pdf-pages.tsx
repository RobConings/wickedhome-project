import * as React from "react";
import { CircleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LoadingState } from "./loading-state";
import { loadPdfJs, type PDFDocumentProxy } from "../lib/pdf";
import { cn } from "@/lib/utils";

type PdfPagesProps = {
  /** Same-origin URL of the PDF (fetched with the session cookie). */
  url: string;
  /** Accessible name of the document. */
  title: string;
  /** Pages shown at most (a long PDF stops there). */
  maxPages?: number;
  className?: string;
};

/**
 * A PDF drawn in the page with pdf.js, page under page at the container's width. Unlike a frame with the
 * browser's viewer, this works everywhere: phones that hand a framed PDF to another app (Chrome on Android)
 * open it there without the app's login ("Not logged in"), and iOS frames show only the first page.
 */
export function PdfPages({ url, title, maxPages = 20, className }: PdfPagesProps) {
  const { t } = useTranslation("common");
  const pages = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "failed">("loading");

  React.useEffect(() => {
    const container = pages.current;
    if (!container) return;
    const controller = new AbortController();
    let pdf: PDFDocumentProxy | null = null;
    setStatus("loading");
    container.replaceChildren();
    (async () => {
      const response = await fetch(url, { credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      const data = new Uint8Array(await response.arrayBuffer());
      const library = await loadPdfJs();
      pdf = await library.getDocument({ data, isEvalSupported: false }).promise;
      const width = Math.max(container.clientWidth, 320);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      for (let number = 1; number <= Math.min(pdf.numPages, maxPages); number++) {
        if (controller.signal.aborted) return;
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "block h-auto w-full bg-white shadow-sm";
        canvas.setAttribute("aria-label", t("pdf.page", { page: number, total: pdf.numPages }));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No canvas");
        await page.render({ canvasContext: context, canvas, viewport }).promise;
        container.append(canvas);
        if (number === 1) setStatus("ready");
      }
      setStatus("ready");
    })().catch(() => {
      if (!controller.signal.aborted) setStatus("failed");
    });
    return () => {
      controller.abort();
      void pdf?.destroy();
    };
  }, [url, maxPages, t]);

  return (
    <div className={cn("relative min-h-40", className)} role="document" aria-label={title} aria-busy={status === "loading" || undefined}>
      <div ref={pages} className="flex flex-col gap-3 p-2" />
      {status === "loading" && <LoadingState label={t("pdf.loading")} className="absolute inset-0 min-h-0" />}
      {status === "failed" && (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="alert">
          <CircleAlertIcon className="size-8 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("pdf.failed")}</p>
        </div>
      )}
    </div>
  );
}
