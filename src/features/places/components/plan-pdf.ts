import { loadPdfJs, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from "@/lib/pdf";
import type { UnderlayRect } from "../types/places";
import type { PlanTextItem } from "./plan-labels";

// pdf.js itself is loaded on demand by `@/lib/pdf` (shared with the PDF previews).

export { loadPdfJs };
export type { PDFDocumentProxy, PDFPageProxy };

/** Opens a PDF from its bytes. `onProgress` gets 0–1 while it is parsed. */
export async function openPdf(data: ArrayBuffer, onProgress?: (fraction: number) => void): Promise<PDFDocumentProxy> {
  const library = await loadPdfJs();
  const task = library.getDocument({ data: new Uint8Array(data), isEvalSupported: false });
  if (onProgress) task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => onProgress(total ? Math.min(1, loaded / total) : 0);
  return task.promise;
}

/** A page's size in PDF points, as shown (its own rotation applied). */
export function pageSize(page: PDFPageProxy): { width: number; height: number } {
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}

/** Largest underlay image: about 6000 px on the long side and 16 megapixels (the iOS canvas limit). */
const MAX_LONG_SIDE = 6000;
const MAX_PIXELS = 16_000_000;

/** Pixels per underlay unit for the final image of a crop: as sharp as the limits allow, at most 8×. */
export function renderScale(crop: Pick<UnderlayRect, "width" | "height">, { longSide = MAX_LONG_SIDE, pixels = MAX_PIXELS, max = 8 } = {}) {
  return Math.min(longSide / Math.max(crop.width, crop.height), Math.sqrt(pixels / (crop.width * crop.height)), max);
}

/**
 * Renders part of a page (`crop` in points, the whole page by default) at `scale` pixels per point, on
 * white, into `canvas` (a new one by default). Cancelled through `signal`.
 */
export async function renderPdfPage(
  page: PDFPageProxy,
  { scale, crop, canvas = document.createElement("canvas"), signal }: { scale: number; crop?: UnderlayRect; canvas?: HTMLCanvasElement; signal?: AbortSignal },
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const region = crop ?? { x: 0, y: 0, width: viewport.width / scale, height: viewport.height / scale };
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const task: RenderTask = page.render({
    canvas,
    viewport,
    transform: [1, 0, 0, 1, -region.x * scale, -region.y * scale],
    background: "#ffffff",
  });
  const cancel = () => task.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return canvas;
}

/** Draws part of an image (`crop` in pixels) into a canvas, scaled down to the size limits. */
export function renderImageCrop(image: ImageBitmap, crop: UnderlayRect, canvas = document.createElement("canvas")): HTMLCanvasElement {
  const scale = Math.min(1, renderScale(crop));
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image"))), type));
}

/**
 * The page's text with positions in points (y down, page rotation applied): left, top, width, height of
 * each piece of text, for finding room labels.
 */
export async function pageTextItems(page: PDFPageProxy): Promise<PlanTextItem[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: PlanTextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform as number[];
    const run = Math.hypot(a, b) || 1;
    // Baseline start and end, and the same points one glyph height up (the text matrix's c, d), in PDF
    // space → viewport.
    const along = { x: (a / run) * item.width, y: (b / run) * item.width };
    const up = { x: c, y: d };
    const corners = [
      [e, f],
      [e + along.x, f + along.y],
      [e + up.x, f + up.y],
      [e + along.x + up.x, f + along.y + up.y],
    ].map(([x, y]) => viewport.convertToViewportPoint(x ?? 0, y ?? 0));
    const xs = corners.map((point) => point[0] ?? 0);
    const ys = corners.map((point) => point[1] ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    items.push({ str: item.str, x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top });
  }
  return items;
}
