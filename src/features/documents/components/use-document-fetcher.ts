import * as React from "react";
import { useFetcher } from "react-router";
import type { DocumentActionResult } from "../data/documents-loaders";

/**
 * A fetcher for one dialog opening: a fresh key each time `open` turns true, so errors from a previous
 * attempt don't linger. `onSaved` runs once when the action succeeded (toast, close the dialog).
 */
export function useDialogFetcher(name: string, open: boolean, onSaved: (result: DocumentActionResult) => void) {
  const [session, setSession] = React.useState(0);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((value) => value + 1);
  }
  const fetcher = useFetcher<DocumentActionResult>({ key: `documents-${name}-${session}` });
  const saved = fetcher.state === "idle" && fetcher.data?.ok === true;

  const onSavedRef = React.useRef(onSaved);
  React.useEffect(() => {
    onSavedRef.current = onSaved;
  });
  const data = fetcher.data;
  React.useEffect(() => {
    if (saved && data) onSavedRef.current(data);
  }, [saved, data]);

  return { fetcher, submitting: fetcher.state !== "idle" };
}
