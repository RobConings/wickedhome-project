import * as React from "react";
import type { DocumentEntityType, DocumentFile, DocumentLinkRef } from "../types/documents";
import { attachFile, detachFile, fetchLinkedFiles } from "./documents-requests";

type Status = "loading" | "ready" | "error";

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * The documents attached to one item, loaded on mount (and again when the item changes; another item's
 * files are never shown meanwhile). `status` is `"loading"` until the first answer and `"error"` when that
 * failed (`reload` tries again). `attach` adds the file at once; `attach` and `detach` mark the file as busy
 * (`busyIds`) until the server answered, and roll back if it failed (the error is rethrown for a toast).
 */
export function useDocumentAttachments(
  entityType: DocumentEntityType,
  entityId: string,
  {
    initial,
    load = fetchLinkedFiles,
  }: {
    initial?: DocumentFile[];
    /** Loads the attached files; the API by default (stories pass their own). */
    load?: (ref: DocumentLinkRef) => Promise<DocumentFile[]>;
  } = {},
) {
  const entityKey = `${entityType}:${entityId}`;
  const seeded = initial !== undefined;
  // `key`: the item `files` belong to; `null` while (re)loading.
  const [state, setState] = React.useState<{ key: string | null; files: DocumentFile[]; failed: boolean }>(() => ({
    key: seeded ? entityKey : null,
    files: initial ?? [],
    failed: false,
  }));
  const [attempt, setAttempt] = React.useState(0);
  const [busyIds, setBusyIds] = React.useState<ReadonlySet<string>>(NO_IDS);
  const loadRef = React.useRef(load);
  React.useEffect(() => {
    loadRef.current = load;
  });

  React.useEffect(() => {
    if (seeded) return;
    let cancelled = false;
    loadRef.current({ entityType, entityId })
      .then((list) => {
        if (!cancelled) setState({ key: entityKey, files: list, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key: entityKey, files: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, entityKey, seeded, attempt]);

  const current = seeded || state.key === entityKey;
  const status: Status = !current ? "loading" : state.failed ? "error" : "ready";
  const files = current && !state.failed ? state.files : [];

  const reload = React.useCallback(() => {
    setState({ key: null, files: [], failed: false });
    setAttempt((value) => value + 1);
  }, []);

  const setFiles = React.useCallback((update: (files: DocumentFile[]) => DocumentFile[]) => {
    setState((previous) => ({ ...previous, files: update(previous.files) }));
  }, []);

  const markBusy = React.useCallback((fileId: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }, []);

  /** Adds a file that was uploaded with this item as its link (already attached on the server). */
  const addUploaded = React.useCallback(
    (file: DocumentFile) => setFiles((list) => [file, ...list.filter((existing) => existing.id !== file.id)]),
    [setFiles],
  );

  const attach = React.useCallback(
    async (file: DocumentFile) => {
      addUploaded(file);
      markBusy(file.id, true);
      try {
        await attachFile({ fileId: file.id, entityType, entityId });
      } catch (error) {
        setFiles((list) => list.filter((existing) => existing.id !== file.id));
        throw error;
      } finally {
        markBusy(file.id, false);
      }
    },
    [addUploaded, markBusy, setFiles, entityType, entityId],
  );

  const detach = React.useCallback(
    async (file: DocumentFile) => {
      markBusy(file.id, true);
      try {
        await detachFile({ fileId: file.id, entityType, entityId });
        setFiles((list) => list.filter((existing) => existing.id !== file.id));
      } finally {
        markBusy(file.id, false);
      }
    },
    [markBusy, setFiles, entityType, entityId],
  );

  return { files, status, busyIds, reload, attach, detach, addUploaded };
}
