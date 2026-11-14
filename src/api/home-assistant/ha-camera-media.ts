import { randomBytes } from "node:crypto";
import { HttpError } from "../lib/http";

export const MAX_CAMERA_BYTES = 12 * 1024 * 1024;

/** Only the configured HA origin is contacted. Upstream redirects are never followed. */
export async function readCameraMedia(url: URL, token: string, fetcher: typeof fetch = fetch, range?: string) {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
    redirect: "error", signal: AbortSignal.timeout(20_000),
  }).catch(() => { throw new HttpError(502, "camera_unavailable", "The camera image or stream is not available"); });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new HttpError(502, "camera_unavailable", "The camera image or stream is not available");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_CAMERA_BYTES) throw new HttpError(502, "camera_media_too_large", "The camera response is too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof HttpError ? error : new HttpError(502, "camera_unavailable", "The camera stopped answering");
  }
  return { body: Buffer.concat(chunks), type: response.headers.get("content-type")?.split(";")[0]?.trim() ?? "", status: response.status,
    contentRange: response.headers.get("content-range") };
}

/** A stream URL is server state, never a client-supplied URL or an exposed HA media token. */
export function cameraStreamRoot(url: URL, origin: URL): string {
  const match = /^\/api\/hls\/[A-Za-z0-9_-]+\//.exec(url.pathname);
  if (url.origin !== origin.origin || url.username || url.password || url.hash || !match) {
    throw new HttpError(502, "camera_stream_invalid", "Home Assistant returned an unsupported stream address");
  }
  return match[0];
}

export function rewriteCameraPlaylist(body: string, source: URL, root: string, register: (url: URL) => string): string {
  if (!body.startsWith("#EXTM3U") || body.length > 512 * 1024) throw new HttpError(502, "camera_stream_invalid", "Invalid camera playlist");
  const rewrite = (uri: string) => {
    let url: URL;
    try { url = new URL(uri, source); } catch { throw new HttpError(502, "camera_stream_invalid", "Invalid camera stream asset"); }
    if (url.origin !== source.origin || !url.pathname.startsWith(root) || /%(?:2f|5c)/i.test(url.pathname) || url.username || url.password || url.hash) {
      throw new HttpError(502, "camera_stream_invalid", "Camera stream asset is outside its session");
    }
    return register(url);
  };
  return body.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith("#")) {
      // No key, map or media URL can bypass the authenticated media proxy.
      return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${rewrite(uri)}"`);
    }
    return rewrite(line.trim());
  }).join("\n");
}

export const newCameraMediaId = () => randomBytes(18).toString("hex");
