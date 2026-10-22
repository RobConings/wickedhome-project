import * as React from "react";
import { ArrowLeftIcon, CropIcon, FileUpIcon, MaximizeIcon, MinusIcon, PlusIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FileDropZone } from "@/components/shared/file-drop-zone";
import { InlineAlert } from "@/components/shared/inline-alert";
import { documentContentUrl, uploadDocument, type UploadDocumentOptions } from "@/features/documents";
import { ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Floor, FloorUnderlay, UnderlayLabel, UnderlayRect } from "../types/places";
import { PlanCompass } from "./plan-compass";
import { PLAN_IMPORT_ACCEPT, PLAN_IMPORT_TYPES, type PlanImportResult } from "./plan-import-types";
import { parsePlanLabels } from "./plan-labels";
import { pageRectToPreview, previewRectToPage, quarterTurn } from "./plan-orientation";
import {
  canvasToBlob,
  openPdf,
  pageSize,
  pageTextItems,
  renderImageCrop,
  renderPdfPage,
  renderScale,
  type PDFDocumentProxy,
} from "./plan-pdf";

/** An opened file: a PDF (pdf.js document) or an image. `storedId` once it is in Documents. */
export type PlanSource =
  | { kind: "pdf"; name: string; mimeType: string; blob: Blob; pdf: PDFDocumentProxy }
  | { kind: "image"; name: string; mimeType: string; blob: Blob; image: ImageBitmap };

export type PlanImportStage = "upload-source" | "render" | "upload-image" | "labels";

type Step =
  | { type: "file"; error?: string }
  | { type: "opening"; progress: number | null; error?: string }
  | { type: "pages" }
  | { type: "crop"; page: number }
  | { type: "importing"; page: number; stage: PlanImportStage; progress: number | null };

type Upload = (blob: Blob, options: UploadDocumentOptions) => Promise<{ id: string }>;

type PlanImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The floor the plan is for: the files are linked to it in Documents. */
  floor: Pick<Floor, "id" | "name">;
  /** Redo the crop of the plan imported before (its original is already in Documents). */
  source?: FloorUnderlay;
  onImported: (result: PlanImportResult) => void;
  /** North on the plan once it is known: a compass on the preview helps turn the drawing the same way. */
  north?: number | null;
  /** Stories: start with this file instead of asking for one. */
  initialFile?: File;
  /** Stories: stores a file (the documents API by default). */
  upload?: Upload;
  /** Stories: loads a stored original (from Documents by default). */
  loadStored?: (fileId: string) => Promise<Blob>;
};

async function fetchStored(fileId: string): Promise<Blob> {
  const response = await fetch(documentContentUrl(fileId), { credentials: "same-origin" });
  if (!response.ok) throw new ApiRequestError(response.status, "not_found", response.statusText);
  return response.blob();
}

/** The type from the file, or from its extension when the browser doesn't say. */
function mimeTypeOf(blob: Blob, name: string): string {
  const type = blob.type.split(";")[0]?.trim().toLowerCase();
  if (type) return type === "image/jpg" ? "image/jpeg" : type;
  const extension = name.toLowerCase().split(".").pop();
  return extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "";
}

const isAbort = (error: unknown, signal: AbortSignal) =>
  signal.aborted ||
  (error instanceof ApiRequestError && error.code === "aborted") ||
  (error instanceof Error && error.name === "RenderingCancelledException");

/** Gives the browser a frame to show the progress before heavy work on the main thread. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Room labels in the crop, relative to its top-left. */
async function findLabels(pdf: PDFDocumentProxy, page: number, crop: UnderlayRect): Promise<UnderlayLabel[]> {
  const items = await pageTextItems(await pdf.getPage(page));
  const inside = items
    .filter((item) => {
      const x = item.x + item.width / 2;
      const y = item.y + item.height / 2;
      return x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height;
    })
    .map((item) => ({ ...item, x: item.x - crop.x, y: item.y - crop.y }));
  return parsePlanLabels(inside).map(({ name, areaM2, u, v }) => ({ name: name.slice(0, 60), areaM2, u, v }));
}

const sameRect = (a: UnderlayRect, b: UnderlayRect) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/**
 * Importing an architect's plan for a floor, in steps: choose a PDF (or PNG/JPG), pick a page (with
 * thumbnails), drag a rectangle around one drawing, then the original and a high-resolution image of the
 * crop are stored in Documents (linked to the floor) and the PDF's room labels are read.
 */
export function PlanImportDialog({
  open,
  onOpenChange,
  floor,
  source: stored,
  onImported,
  north = null,
  initialFile,
  upload = uploadDocument,
  loadStored = fetchStored,
}: PlanImportDialogProps) {
  const { t } = useTranslation("places");
  const [step, setStep] = React.useState<Step>(stored || initialFile ? { type: "opening", progress: null } : { type: "file" });
  const [source, setSource] = React.useState<PlanSource | null>(null);
  const [crop, setCrop] = React.useState<UnderlayRect | null>(stored?.crop ?? null);
  /** The preview's quarter turn (clockwise), handed on as the underlay's rotation. Redoing a crop starts as it was. */
  const [turn, setTurn] = React.useState(() => (stored ? quarterTurn(stored.rotation) : 0));
  const [importError, setImportError] = React.useState<string | null>(null);
  /** Size of the page being cropped, in underlay units (for "whole page"). */
  const [pageArea, setPageArea] = React.useState<{ width: number; height: number } | null>(null);
  /** The original's document id once stored, so a retry doesn't upload it again. */
  const storedId = React.useRef<string | undefined>(stored?.sourceFileId);
  const abort = React.useRef<AbortController | null>(null);

  // Free pdf.js memory (and the worker's copy) when another file is opened or the dialog closes.
  React.useEffect(
    () => () => {
      if (source?.kind === "pdf") void source.pdf.destroy();
      else source?.image.close();
    },
    [source],
  );
  React.useEffect(() => () => abort.current?.abort(), []);

  const openFile = React.useCallback(
    async (blob: Blob, name: string, options: { storedAs?: string; page?: number } = {}) => {
      const mimeType = mimeTypeOf(blob, name);
      if (!(PLAN_IMPORT_TYPES as readonly string[]).includes(mimeType)) {
        setStep({ type: "file", error: t("editor.import.wrongType") });
        return;
      }
      const typed = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
      storedId.current = options.storedAs;
      setImportError(null);
      setStep({ type: "opening", progress: null });
      try {
        if (mimeType === "application/pdf") {
          const pdf = await openPdf(await typed.arrayBuffer(), (progress) => setStep({ type: "opening", progress }));
          setSource({ kind: "pdf", name, mimeType, blob: typed, pdf });
          const page = options.page && options.page <= pdf.numPages ? options.page : undefined;
          setStep(page || pdf.numPages === 1 ? { type: "crop", page: page ?? 1 } : { type: "pages" });
        } else {
          const image = await createImageBitmap(typed);
          setSource({ kind: "image", name, mimeType, blob: typed, image });
          setStep({ type: "crop", page: 1 });
        }
      } catch {
        setStep({ type: "file", error: t("editor.import.unreadable") });
      }
    },
    [t],
  );

  // Start with the stored original (redo the crop) or a given file (stories). Once.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (stored) {
      loadStored(stored.sourceFileId).then(
        (blob) => openFile(blob, stored.sourceName, { storedAs: stored.sourceFileId, page: stored.page }),
        () => setStep({ type: "file", error: t("editor.import.sourceMissing") }),
      );
    } else if (initialFile) {
      void Promise.resolve(initialFile).then((file) => openFile(file, file.name));
    }
  }, [stored, initialFile, loadStored, openFile, t]);

  async function runImport(page: number, area: UnderlayRect) {
    if (!source) return;
    const controller = new AbortController();
    abort.current = controller;
    const { signal } = controller;
    const link = { entityType: "floor" as const, entityId: floor.id };
    const progress = (stage: PlanImportStage) => ({ fraction }: { fraction: number }) =>
      setStep({ type: "importing", page, stage, progress: fraction });
    setImportError(null);
    try {
      let sourceFileId = storedId.current;
      if (!sourceFileId) {
        setStep({ type: "importing", page, stage: "upload-source", progress: 0 });
        sourceFileId = (await upload(source.blob, { name: source.name, link, signal, onProgress: progress("upload-source") })).id;
        storedId.current = sourceFileId;
      }

      setStep({ type: "importing", page, stage: "render", progress: null });
      await nextFrame();
      let imageFileId: string;
      const whole = source.kind === "image" && sameRect(area, { x: 0, y: 0, width: source.image.width, height: source.image.height });
      if (whole && renderScale(area) >= 1) {
        // An uncropped image within the size limits is shown as it is.
        imageFileId = sourceFileId;
      } else {
        const canvas =
          source.kind === "pdf"
            ? await renderPdfPage(await source.pdf.getPage(page), { scale: renderScale(area), crop: area, signal })
            : renderImageCrop(source.image, area);
        const image = await canvasToBlob(canvas, "image/png");
        // Release the large canvas right away.
        canvas.width = 0;
        canvas.height = 0;
        if (signal.aborted) throw new ApiRequestError(0, "aborted", "Cancelled");
        setStep({ type: "importing", page, stage: "upload-image", progress: 0 });
        const stem = source.name.replace(/\.[^.]+$/, "");
        imageFileId = (
          await upload(image, { name: t("editor.import.imageName", { name: stem, page }), link, signal, onProgress: progress("upload-image") })
        ).id;
      }

      let labels: UnderlayLabel[] = [];
      if (source.kind === "pdf") {
        setStep({ type: "importing", page, stage: "labels", progress: null });
        // Labels are a bonus: a PDF without readable text still imports.
        labels = await findLabels(source.pdf, page, area).catch(() => []);
      }
      onImported({
        sourceFileId,
        imageFileId,
        sourceName: source.name.slice(0, 200),
        sourceMimeType: source.mimeType,
        unit: source.kind === "pdf" ? "pt" : "px",
        page,
        crop: area,
        labels,
        rotation: turn,
      });
    } catch (error) {
      if (!isAbort(error, signal)) {
        setImportError(
          error instanceof ApiRequestError && error.status === 413
            ? t("editor.import.tooLarge")
            : error instanceof ApiRequestError && error.code === "network"
              ? t("editor.import.network")
              : t("editor.import.failed"),
        );
      }
      setStep({ type: "crop", page });
    } finally {
      abort.current = null;
    }
  }

  const pageCount = source?.kind === "pdf" ? source.pdf.numPages : 1;
  const title =
    step.type === "pages" ? t("editor.import.pagesTitle") : step.type === "crop" ? t("editor.import.cropTitle") : t("editor.import.title");
  const description =
    step.type === "pages"
      ? t("editor.import.pagesDescription")
      : step.type === "crop"
        ? t("editor.import.cropDescription")
        : t("editor.import.description", { floor: floor.name });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step.type === "file" && (
          <div className="flex flex-col gap-3">
            {step.error && <InlineAlert tone="error">{step.error}</InlineAlert>}
            <FileDropZone
              accept={PLAN_IMPORT_ACCEPT}
              icon={FileUpIcon}
              onFiles={([file]) => file && void openFile(file, file.name)}
              title={t("editor.import.dropTitle")}
              description={t("editor.import.dropDescription")}
              buttonLabel={t("editor.import.choose")}
            />
            <p className="text-xs text-muted-foreground">{t("editor.import.privacy")}</p>
          </div>
        )}

        {step.type === "opening" && (
          <PlanImportBusy label={t("editor.import.opening")} progress={step.progress} />
        )}

        {step.type === "pages" && source?.kind === "pdf" && (
          <PlanPagePicker
            pdf={source.pdf}
            onPick={(page) => {
              setCrop(null);
              setStep({ type: "crop", page });
            }}
          />
        )}

        {(step.type === "crop" || step.type === "importing") && source && (
          <div className="relative flex min-h-0 flex-col gap-3">
            <PlanCropStep
              key={`${step.page}`}
              source={source}
              page={step.page}
              value={crop}
              onChange={setCrop}
              onPageSize={setPageArea}
              disabled={step.type === "importing"}
              rotation={turn}
              onRotate={setTurn}
              north={north}
            />
            {step.type === "importing" && (
              <div className="absolute inset-0 grid place-items-center rounded-lg bg-background/70 backdrop-blur-sm">
                <PlanImportBusy
                  className="w-full max-w-sm rounded-xl border bg-popover p-4 shadow-md"
                  label={t(`editor.import.stage.${step.stage}`)}
                  progress={step.progress}
                  onCancel={() => abort.current?.abort()}
                  cancelLabel={t("editor.import.cancel")}
                />
              </div>
            )}
            {importError && <InlineAlert tone="error">{importError}</InlineAlert>}
          </div>
        )}

        {(step.type === "crop" || step.type === "importing" || step.type === "pages") && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={step.type === "importing"}
              onClick={() => (step.type === "crop" && pageCount > 1 ? setStep({ type: "pages" }) : setStep({ type: "file" }))}
            >
              <ArrowLeftIcon />
              {step.type === "crop" && pageCount > 1 ? t("editor.import.otherPage") : t("editor.import.otherFile")}
            </Button>
            {step.type !== "pages" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={step.type === "importing" || !pageArea}
                  onClick={() => pageArea && void runImport(step.page, { x: 0, y: 0, ...pageArea })}
                >
                  <MaximizeIcon />
                  {t("editor.import.wholePage")}
                </Button>
                <Button
                  type="button"
                  disabled={!crop}
                  loading={step.type === "importing"}
                  onClick={() => crop && void runImport(step.page, crop)}
                >
                  <CropIcon />
                  {t("editor.import.importCrop")}
                </Button>
              </div>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Busy ------------------------------------------------------------------------------------------------------

/** A step that takes a while: a label, a progress bar (a percentage when known) and an optional cancel. */
export function PlanImportBusy({
  label,
  progress,
  onCancel,
  cancelLabel,
  className,
}: {
  label: string;
  progress: number | null;
  onCancel?: () => void;
  cancelLabel?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-3 py-6", className)}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Spinner className="size-4" />
        {label}
        {progress !== null && <span className="ml-auto text-muted-foreground tabular-nums">{Math.round(progress * 100)} %</span>}
      </p>
      <Progress value={progress === null ? null : progress * 100} label={label} />
      {onCancel && (
        <Button type="button" variant="outline" size="sm" className="self-end" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}

// Pages -----------------------------------------------------------------------------------------------------

const THUMB_SIZE = 180;

/** Every page as a thumbnail, rendered one after the other; click one to crop it. */
export function PlanPagePicker({ pdf, onPick }: { pdf: PDFDocumentProxy; onPick: (page: number) => void }) {
  const { t } = useTranslation("places");
  const [thumbs, setThumbs] = React.useState<(string | null)[]>(() => Array.from({ length: pdf.numPages }, () => null));
  const done = thumbs.filter(Boolean).length;

  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      for (let number = 1; number <= pdf.numPages && !controller.signal.aborted; number++) {
        const page = await pdf.getPage(number);
        const size = pageSize(page);
        const canvas = await renderPdfPage(page, { scale: THUMB_SIZE / Math.max(size.width, size.height), signal: controller.signal });
        const url = canvas.toDataURL("image/png");
        if (!controller.signal.aborted) setThumbs((current) => current.map((thumb, index) => (index === number - 1 ? url : thumb)));
      }
    })().catch(() => undefined);
    return () => controller.abort();
  }, [pdf]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {done < thumbs.length && (
        <div className="flex flex-col gap-1.5" role="status">
          <p className="text-xs text-muted-foreground">{t("editor.import.renderingPages", { done, count: thumbs.length })}</p>
          <Progress value={(done / thumbs.length) * 100} label={t("editor.import.renderingPages", { done, count: thumbs.length })} />
        </div>
      )}
      <ul className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
        {thumbs.map((thumb, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => onPick(index + 1)}
              className="flex w-full flex-col items-center gap-1.5 rounded-lg border p-2 text-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {thumb ? (
                <img src={thumb} alt="" className="h-36 w-full object-contain" />
              ) : (
                <Skeleton className="h-36 w-full" />
              )}
              {t("editor.import.page", { number: index + 1 })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Crop ------------------------------------------------------------------------------------------------------

const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];

type Fraction = { x: number; y: number };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The page (or image) to drag a rectangle on. Zoom with the buttons or Ctrl + scroll; scroll to move
 * around; turn it in quarter turns. `value` is the selection in underlay units (on the page itself, not
 * the turned preview).
 */
export function PlanCropStep({
  source,
  page,
  value,
  onChange,
  onPageSize,
  disabled = false,
  rotation = 0,
  onRotate,
  north = null,
}: {
  source: PlanSource;
  page: number;
  value: UnderlayRect | null;
  onChange: (crop: UnderlayRect | null) => void;
  /** The page's size in underlay units, once known. */
  onPageSize?: (size: { width: number; height: number }) => void;
  disabled?: boolean;
  /** The preview's quarter turn, degrees clockwise (0, 90, 180, 270). */
  rotation?: number;
  onRotate?: (rotation: number) => void;
  /** North on the plan, when known: shown as a compass over the preview. */
  north?: number | null;
}) {
  const { t } = useTranslation("places");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = React.useState<"rendering" | "ready" | "error">("rendering");
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(
    source.kind === "image" ? { width: source.image.width, height: source.image.height } : null,
  );
  const [box, setBox] = React.useState({ width: 0, height: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [dragging, setDragging] = React.useState<{ start: Fraction; end: Fraction } | null>(null);
  const zoomRef = React.useRef(zoom);
  const onPageSizeRef = React.useRef(onPageSize);
  React.useLayoutEffect(() => {
    zoomRef.current = zoom;
    onPageSizeRef.current = onPageSize;
  }, [zoom, onPageSize]);

  // Render the page once per page (the component is keyed by page).
  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (source.kind === "pdf") {
        const pdfPage = await source.pdf.getPage(page);
        const pageArea = pageSize(pdfPage);
        setSize(pageArea);
        onPageSizeRef.current?.(pageArea);
        // Render into a fresh canvas and copy it over when done: pdf.js refuses a second render on a canvas
        // whose previous render is still being cancelled (React runs this effect twice in development).
        const rendered = await renderPdfPage(pdfPage, {
          scale: renderScale(pageArea, { longSide: 4096, pixels: 12_000_000, max: 4 }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        canvas.getContext("2d")?.drawImage(rendered, 0, 0);
        rendered.width = 0;
        rendered.height = 0;
      } else {
        onPageSizeRef.current?.({ width: source.image.width, height: source.image.height });
        renderImageCrop(source.image, { x: 0, y: 0, width: source.image.width, height: source.image.height }, canvas);
      }
      if (!controller.signal.aborted) setStatus("ready");
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.warn("Plan import: the page could not be rendered", error);
      setStatus("error");
    });
    return () => controller.abort();
  }, [source, page]);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Zoom 1 fits the whole (turned) page in the box.
  const quarter = quarterTurn(rotation);
  const sideways = quarter === 90 || quarter === 270;
  const aspect = size ? (sideways ? size.height / size.width : size.width / size.height) : 1;
  const fitWidth = Math.max(0, Math.min(box.width, box.height * aspect));
  const width = fitWidth * zoom;

  // Keep the middle of the view in the middle when zooming.
  const changeZoom = React.useCallback((next: number) => {
    const element = scrollRef.current;
    setZoom((current) => {
      const clamped = Math.min(ZOOMS.at(-1)!, Math.max(1, next));
      if (element) {
        const ratio = clamped / current;
        const middleX = element.scrollLeft + element.clientWidth / 2;
        const middleY = element.scrollTop + element.clientHeight / 2;
        requestAnimationFrame(() => {
          element.scrollLeft = middleX * ratio - element.clientWidth / 2;
          element.scrollTop = middleY * ratio - element.clientHeight / 2;
        });
      }
      return clamped;
    });
  }, []);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; a plain wheel scrolls.
  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeZoom(zoomRef.current * Math.exp(-event.deltaY * 0.01));
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [changeZoom]);

  const toFraction = (event: React.PointerEvent<HTMLDivElement>): Fraction => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
  };

  // Fractions of the preview as shown (turned); the selection itself is stored on the page.
  const shown: { x: number; y: number; width: number; height: number } | null = dragging
    ? {
        x: Math.min(dragging.start.x, dragging.end.x),
        y: Math.min(dragging.start.y, dragging.end.y),
        width: Math.abs(dragging.end.x - dragging.start.x),
        height: Math.abs(dragging.end.y - dragging.start.y),
      }
    : value && size
      ? pageRectToPreview(
          { x: value.x / size.width, y: value.y / size.height, width: value.width / size.width, height: value.height / size.height },
          quarter,
        )
      : null;

  const nextZoomIn = ZOOMS.find((step) => step > zoom + 1e-6);
  const nextZoomOut = [...ZOOMS].reverse().find((step) => step < zoom - 1e-6);
  // Sideways, the canvas keeps the page's own shape and is turned inside a box of the turned shape.
  const canvasStyle: React.CSSProperties | undefined = sideways
    ? { position: "absolute", left: "50%", top: "50%", width: width / aspect, height: width, transform: `translate(-50%, -50%) rotate(${quarter}deg)` }
    : quarter === 180
      ? { transform: "rotate(180deg)" }
      : undefined;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">{value ? t("editor.import.cropSelected") : t("editor.import.cropHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
        {onRotate && (
          <div role="group" aria-label={t("editor.import.rotation", { degrees: quarter })} className="inline-flex items-center gap-0.5 rounded-lg border p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onRotate((quarter + 270) % 360)}
              aria-label={t("editor.underlay.rotateLeft")}
              title={t("editor.underlay.rotateLeft")}
            >
              <RotateCcwIcon />
            </Button>
            <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {quarter}°
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onRotate((quarter + 90) % 360)}
              aria-label={t("editor.underlay.rotateRight")}
              title={t("editor.underlay.rotateRight")}
            >
              <RotateCwIcon />
            </Button>
          </div>
        )}
        <div role="group" aria-label={`${Math.round(zoom * 100)}%`} className="inline-flex items-center gap-0.5 rounded-lg border p-0.5">
          <Button type="button" variant="ghost" size="icon-sm" disabled={!nextZoomOut} onClick={() => changeZoom(nextZoomOut ?? 1)} aria-label={t("editor.zoom.out")}>
            <MinusIcon />
          </Button>
          <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="ghost" size="icon-sm" disabled={!nextZoomIn} onClick={() => changeZoom(nextZoomIn ?? zoom)} aria-label={t("editor.zoom.in")}>
            <PlusIcon />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => changeZoom(1)} disabled={zoom === 1}>
            {t("editor.zoom.fit")}
          </Button>
        </div>
        </div>
      </div>
      <div className="relative">
      {north !== null && (
        <div className="pointer-events-none absolute top-2 right-2 z-10 flex flex-col items-center gap-1">
          <PlanCompass north={north} size="sm" />
          <span className="rounded-full bg-popover/95 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm">{t("orientation.importHint")}</span>
        </div>
      )}
      <div ref={scrollRef} className="relative h-[min(60vh,40rem)] overflow-auto rounded-lg border bg-muted">
        <div
          className={cn(
            "relative mx-auto touch-none select-none",
            disabled ? "pointer-events-none" : "cursor-crosshair",
            sideways && !width && "min-h-48",
          )}
          style={{ width: width || "100%", height: sideways && width ? width / aspect : undefined }}
          onPointerDown={(event) => {
            if (event.button !== 0 || status !== "ready") return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const start = toFraction(event);
            setDragging({ start, end: start });
          }}
          onPointerMove={(event) => dragging && setDragging({ ...dragging, end: toFraction(event) })}
          onPointerUp={(event) => {
            if (!dragging) return;
            const end = toFraction(event);
            setDragging(null);
            const fraction = previewRectToPage(
              {
                x: Math.min(dragging.start.x, end.x),
                y: Math.min(dragging.start.y, end.y),
                width: Math.abs(end.x - dragging.start.x),
                height: Math.abs(end.y - dragging.start.y),
              },
              quarter,
            );
            // A click (or a sliver) keeps the current selection.
            if (!size || fraction.width < 0.01 || fraction.height < 0.01) return;
            onChange({
              x: fraction.x * size.width,
              y: fraction.y * size.height,
              width: fraction.width * size.width,
              height: fraction.height * size.height,
            });
          }}
          onPointerCancel={() => setDragging(null)}
        >
          <canvas
            ref={canvasRef}
            className={cn("block bg-white", !sideways && "h-auto w-full", status !== "ready" && "invisible")}
            style={canvasStyle}
          />
          {status === "rendering" && (
            <div className="absolute inset-0 grid min-h-48 place-items-center">
              <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {t("editor.import.renderingPage")}
              </span>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 grid min-h-48 place-items-center p-4">
              <InlineAlert tone="error">{t("editor.import.renderFailed")}</InlineAlert>
            </div>
          )}
          {shown && (
            <div
              className="pointer-events-none absolute border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
              style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.width * 100}%`, height: `${shown.height * 100}%` }}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
