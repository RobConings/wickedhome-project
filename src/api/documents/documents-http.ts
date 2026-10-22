import { isInlineSafeMimeType } from "@/features/documents/types/documents";
import type { ByteRange } from "./storage/storage-provider";

/**
 * Parses a single-range `Range: bytes=…` header against a file of `size` bytes.
 * - `undefined`: no (usable) Range header → serve the whole file.
 * - `"unsatisfiable"`: syntactically fine but outside the file → 416.
 * Multiple ranges are not supported and fall back to the whole file, which RFC 9110 allows.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, startText = "", endText = ""] = match;
  if (!startText && !endText) return undefined;

  if (!startText) {
    // Suffix range: the last N bytes.
    const length = Number(endText);
    if (length === 0) return "unsatisfiable";
    if (size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(startText);
  const end = endText ? Math.min(Number(endText), size - 1) : size - 1;
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

/**
 * `Content-Disposition` for a download. Images, PDF and audio/video from the allowlist may be shown inline;
 * everything else (HTML, SVG, unknown types) is always an attachment. The name is sent twice: an ASCII
 * fallback with anything risky replaced, and the exact UTF-8 name per RFC 6266 / 5987.
 */
export function contentDisposition(name: string, mimeType: string, forceDownload: boolean): string {
  const type = !forceDownload && isInlineSafeMimeType(mimeType) ? "inline" : "attachment";
  const fallback = name.replace(/[^\x20-\x7e]|["\\%;]/g, "_").slice(0, 150) || "download";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
