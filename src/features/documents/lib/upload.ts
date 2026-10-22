import type { ApiError } from "@/types/common";
import { ApiRequestError } from "./api-client";

export type UploadProgress = {
  loaded: number;
  total: number;
  /** 0–1 */
  fraction: number;
};

type UploadOptions = {
  /** Defaults to PUT: the body is the raw file, no multipart. */
  method?: "PUT" | "POST";
  /** Defaults to the file's own type, or `application/octet-stream`. */
  contentType?: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
};

/**
 * Uploads a file or blob as the raw request body to `/api<path>`, reporting progress. Uses XMLHttpRequest
 * because `fetch` has no upload progress events. Rejects with `ApiRequestError` like the api client
 * (code `"aborted"` when cancelled, `"network"` when the connection fails).
 */
export function uploadBlob<T = unknown>(path: string, body: Blob, options: UploadOptions = {}): Promise<T> {
  const { method = "PUT", contentType = body.type || "application/octet-stream", onProgress, signal } = options;

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiRequestError(0, "aborted", "Upload cancelled"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, `/api${path}`);
    xhr.withCredentials = true;
    // Required by the API's CSRF guard on every mutating request.
    xhr.setRequestHeader("X-WickedHome", "1");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : body.size;
      onProgress?.({ loaded: event.loaded, total, fraction: total ? Math.min(1, event.loaded / total) : 1 });
    };

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // Not JSON (e.g. a proxy's error page).
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: body.size, total: body.size, fraction: 1 });
        resolve(payload as T);
        return;
      }
      const error = (payload as ApiError | null)?.error;
      reject(new ApiRequestError(xhr.status, error?.code ?? "network", error?.message ?? xhr.statusText, error?.fields));
    };
    xhr.onerror = () => reject(new ApiRequestError(0, "network", "Upload failed"));
    xhr.onabort = () => reject(new ApiRequestError(0, "aborted", "Upload cancelled"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(body);
  });
}
