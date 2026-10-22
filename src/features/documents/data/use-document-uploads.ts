import * as React from "react";
import i18n from "i18next";
import { ApiRequestError } from "../lib/api-client";
import { FALLBACK_MIME_TYPE, normalizeMimeType, type DocumentFile, type DocumentLinkRef } from "../types/documents";
import { createFile, uploadFileContent } from "./documents-requests";

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export type UploadItem = {
  /** Local id, not the file id. */
  key: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  status: UploadStatus;
  /** 0–1 */
  progress: number;
  error?: string;
  file?: DocumentFile;
};

type Target = {
  /** Folder to upload into; `null` = the drive root. */
  folderId: string | null;
  /** Attach every uploaded file to this item. */
  link?: DocumentLinkRef;
};

type UseDocumentUploadsOptions = {
  /** Largest accepted file, from `StorageUsage.maxUploadBytes`; bigger files fail before uploading. */
  maxBytes?: number;
  /** Called after each file finished uploading, e.g. to reload the folder. */
  onUploaded?: (file: DocumentFile) => void;
  /** Seed the list (stories). */
  initial?: UploadItem[];
};

/** At most this many files upload at the same time. */
const CONCURRENCY = 3;

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 413) return i18n.t("documents:upload.tooLarge");
    if (error.code === "network") return i18n.t("documents:upload.network");
  }
  return i18n.t("documents:upload.failed");
}

let counter = 0;

/**
 * Upload queue: registers each file, then streams its bytes with per-file progress (XHR), a few at a time.
 * Cancelling aborts the request; finished and failed items stay listed until cleared.
 */
export function useDocumentUploads({ maxBytes, onUploaded, initial = [] }: UseDocumentUploadsOptions = {}) {
  const [items, setItems] = React.useState<UploadItem[]>(initial);
  const files = React.useRef(new Map<string, { blob: File; target: Target }>());
  const controllers = React.useRef(new Map<string, AbortController>());
  const onUploadedRef = React.useRef(onUploaded);
  React.useEffect(() => {
    onUploadedRef.current = onUploaded;
  });

  const patch = React.useCallback((key: string, next: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  const run = React.useCallback(
    async (key: string) => {
      const entry = files.current.get(key);
      if (!entry) return;
      const { blob, target } = entry;
      const controller = new AbortController();
      controllers.current.set(key, controller);
      const mimeType = normalizeMimeType(blob.type) || FALLBACK_MIME_TYPE;
      try {
        const registered = await createFile({
          name: blob.name,
          folderId: target.folderId,
          mimeType,
          sizeBytes: blob.size,
          link: target.link,
        });
        if (controller.signal.aborted) throw new ApiRequestError(0, "aborted", "Upload cancelled");
        const file = await uploadFileContent(registered.id, blob, {
          contentType: registered.mimeType,
          signal: controller.signal,
          onProgress: ({ fraction }) => patch(key, { progress: fraction }),
        });
        patch(key, { status: "done", progress: 1, file });
        onUploadedRef.current?.(file);
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "aborted") patch(key, { status: "cancelled" });
        else patch(key, { status: "error", error: errorMessage(error) });
      } finally {
        controllers.current.delete(key);
        files.current.delete(key);
      }
    },
    [patch],
  );

  const queue = React.useRef<string[]>([]);
  const running = React.useRef(0);

  /** Starts queued uploads while fewer than CONCURRENCY are running. */
  const pump = React.useCallback(() => {
    while (running.current < CONCURRENCY && queue.current.length) {
      const key = queue.current.shift() as string;
      if (!files.current.has(key)) continue; // cancelled while queued
      running.current += 1;
      patch(key, { status: "uploading" });
      void run(key).finally(() => {
        running.current -= 1;
        pump();
      });
    }
  }, [patch, run]);

  // Abort whatever is still running when the component goes away.
  React.useEffect(() => {
    const map = controllers.current;
    return () => map.forEach((controller) => controller.abort());
  }, []);

  const upload = React.useCallback(
    (list: File[], target: Target) => {
      const added: UploadItem[] = list.map((blob) => {
        const key = `upload-${++counter}`;
        const tooLarge = maxBytes !== undefined && blob.size > maxBytes;
        if (!tooLarge) files.current.set(key, { blob, target });
        return {
          key,
          name: blob.name,
          sizeBytes: blob.size,
          mimeType: normalizeMimeType(blob.type) || FALLBACK_MIME_TYPE,
          status: tooLarge ? "error" : "queued",
          progress: 0,
          error: tooLarge ? i18n.t("documents:upload.tooLarge") : undefined,
        };
      });
      setItems((current) => [...current, ...added]);
      queue.current.push(...added.filter((item) => item.status === "queued").map((item) => item.key));
      pump();
    },
    [maxBytes, pump],
  );

  const cancel = React.useCallback(
    (key: string) => {
      controllers.current.get(key)?.abort();
      if (files.current.delete(key)) patch(key, { status: "cancelled" });
    },
    [patch],
  );

  /** Cancels everything that is still queued or uploading. */
  const cancelAll = React.useCallback(() => {
    controllers.current.forEach((controller) => controller.abort());
    const waiting = [...files.current.keys()];
    waiting.forEach((key) => files.current.delete(key));
    queue.current = [];
    setItems((current) =>
      current.map((item) => (waiting.includes(item.key) ? { ...item, status: "cancelled" as const } : item)),
    );
  }, []);

  const clearFinished = React.useCallback(() => {
    setItems((current) => current.filter((item) => item.status === "queued" || item.status === "uploading"));
  }, []);

  return {
    items,
    upload,
    cancel,
    cancelAll,
    clearFinished,
    busy: items.some((item) => item.status === "queued" || item.status === "uploading"),
  };
}
