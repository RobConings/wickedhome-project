import type * as PdfJsModule from "pdfjs-dist";

// pdf.js in the browser, loaded on demand: importing this module costs nothing until a PDF is opened, so
// pdf.js and its worker only download when someone actually shows or imports a PDF.

export type PdfJs = typeof PdfJsModule;
export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

let pdfjs: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")])
    .then(([library, worker]) => {
      library.GlobalWorkerOptions.workerSrc = worker.default;
      return library;
    })
    .catch((error: unknown) => {
      pdfjs = null;
      throw error;
    });
  return pdfjs;
}
