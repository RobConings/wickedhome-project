import * as React from "react";
import { PaperclipIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeIcon } from "@/components/shared/file-type-icon";
import { LoadingState, PendingContent } from "@/components/shared/loading-state";
import { searchDocuments } from "../data/documents-requests";
import type { DocumentFile } from "../types/documents";
import type { WithPath } from "./document-item";
import { fileSize } from "@/lib/locale-text";

type AttachDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (file: DocumentFile) => void;
  /** Files that are already attached; shown as such. */
  attachedIds: string[];
  /** Search function; defaults to the drive search (stories pass their own). */
  search?: (query: string) => Promise<WithPath<DocumentFile>[]>;
};

const searchDrive = async (query: string) => (await searchDocuments(query)).files;

/** Find a file that is already in the drive and attach it. */
export function AttachDocumentDialog({ open, onOpenChange, onSelect, attachedIds, search = searchDrive }: AttachDocumentDialogProps) {
  const { t } = useTranslation("documents");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ query: string; files: WithPath<DocumentFile>[]; failed?: boolean } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const searchRef = React.useRef(search);
  React.useEffect(() => {
    searchRef.current = search;
  });

  const trimmed = query.trim();
  React.useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchRef.current(trimmed)
        .then((files) => !cancelled && setResults({ query: trimmed, files }))
        .catch(() => !cancelled && setResults({ query: trimmed, files: [], failed: true }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, attempt]);

  const current = trimmed && results?.query === trimmed ? results : null;
  const searching = Boolean(trimmed) && !current;
  // While a new search runs, the previous results stay (faded) instead of jumping to "Searching…".
  const shown = current ?? (trimmed && results && !results.failed ? results : null);
  const retry = () => {
    setResults(null);
    setAttempt((value) => value + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("attachments.attachTitle")}</DialogTitle>
          <DialogDescription>{t("attachments.attachDescription")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          {searching ? (
            <Spinner className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          ) : (
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("toolbar.search")}
            aria-label={t("toolbar.search")}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="min-h-32 overflow-y-auto" aria-live="polite">
          {!trimmed ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("attachments.searchHint")}</p>
          ) : current?.failed ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-destructive">{t("attachments.searchFailed")}</p>
              <Button size="sm" variant="outline" onClick={retry}>
                {t("attachments.retry")}
              </Button>
            </div>
          ) : !shown ? (
            <LoadingState label={t("attachments.searching")} />
          ) : (
            <PendingContent pending={searching} label={t("attachments.searching")}>
              {shown.files.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("attachments.noResults")}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {shown.files.map((file) => {
                    const attached = attachedIds.includes(file.id);
                    return (
                      <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                        <FileTypeIcon mimeType={file.mimeType} name={file.name} size="sm" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{file.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[file.path?.map((crumb) => crumb.name).join(" / ") || t("page.title"), fileSize(file.sizeBytes)].join(" · ")}
                          </span>
                        </div>
                        <Button size="sm" variant="outline" disabled={attached} onClick={() => onSelect(file)}>
                          <PaperclipIcon />
                          {attached ? t("attachments.attached") : t("attachments.attach")}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PendingContent>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
