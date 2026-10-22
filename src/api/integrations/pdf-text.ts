/*
 * Text from a PDF (invoices), with pdfjs-dist's legacy build, which runs in Node 20 without a canvas or a
 * browser. Only text is read (no rendering, no fonts, no scripts: `isEvalSupported: false`), from the first
 * few pages, with a time limit. Anything unreadable just gives an empty string: the mail body still counts.
 */

import type * as PdfJsModule from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PAGES = 4;
const MAX_CHARS = 20_000;
const TIMEOUT_MS = 15_000;

type PdfJs = typeof PdfJsModule;
let pdfjs: Promise<PdfJs> | undefined;

async function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await loadPdfJs();
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  const timer = setTimeout(() => void task.destroy(), TIMEOUT_MS);
  try {
    const document = await task.promise;
    const parts: string[] = [];
    let length = 0;
    for (let number = 1; number <= Math.min(document.numPages, MAX_PAGES) && length < MAX_CHARS; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str + (item.hasEOL ? "\n" : " ");
      }
      parts.push(line);
      length += line.length;
      page.cleanup();
    }
    return parts.join("\n").replace(/[ \t]+/g, " ").slice(0, MAX_CHARS);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }
}
