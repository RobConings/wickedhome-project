import * as React from "react";
import { googleClient, type GoogleClient } from "../data/google-client";
import type { MailDocumentOrigin } from "../types/mail-matching";
import { MailOriginNote } from "./mail-origin-note";

/**
 * For an expense's attachments: which documents came from a mail (accepted or linked suggestions). Returns
 * the note to show next to a file ("From mail on 02/10/2026"), or `null`. Loads quietly; a failure just shows
 * no notes.
 *
 *   const fileNote = useMailFileNote(expense.id);
 *   <DocumentAttachments … fileNote={fileNote} />
 */
export function useMailFileNote(expenseId: string, { client = googleClient, initial }: { client?: GoogleClient; initial?: MailDocumentOrigin[] } = {}) {
  const [origins, setOrigins] = React.useState<MailDocumentOrigin[]>(initial ?? []);
  React.useEffect(() => {
    if (initial) return;
    let cancelled = false;
    client
      .mailOrigins(expenseId)
      .then((result) => !cancelled && setOrigins(result.origins))
      .catch(() => !cancelled && setOrigins([]));
    return () => {
      cancelled = true;
    };
  }, [client, expenseId, initial]);
  return React.useCallback(
    (file: { id: string }): React.ReactNode => {
      const origin = origins.find((item) => item.documentFileId === file.id);
      return origin ? <MailOriginNote origin={origin} /> : null;
    },
    [origins],
  );
}
