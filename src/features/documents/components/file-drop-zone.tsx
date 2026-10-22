import * as React from "react";
import { UploadIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFileDrop } from "./use-file-drop";

type FileDropZoneProps = {
  /** Called with the dropped or chosen files. */
  onFiles: (files: File[]) => void;
  /** File types for the picker, e.g. ".csv,text/csv". */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Label of the button that opens the file picker. */
  buttonLabel: string;
  icon?: LucideIcon;
  /** A single row instead of a tall block, e.g. inside a side panel. */
  compact?: boolean;
  className?: string;
};

/** Drop files here or pick them with a button. Reads nothing itself; the caller decides what to do. */
export function FileDropZone({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  title,
  description,
  buttonLabel,
  icon: Icon = UploadIcon,
  compact = false,
  className,
}: FileDropZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { dragging, dropProps } = useFileDrop({ onFiles, multiple, disabled });

  function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <div
      className={cn(
        "flex rounded-xl border-2 border-dashed transition-colors",
        compact
          ? "flex-row items-center gap-3 px-3 py-3 text-left"
          : "flex-col items-center gap-3 px-6 py-10 text-center",
        dragging ? "border-primary bg-accent" : "border-border bg-card",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      {...dropProps}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-section-soft text-section",
          compact ? "size-9" : "size-12",
        )}
      >
        <Icon className={compact ? "size-4" : "size-6"} aria-hidden="true" />
      </span>
      <div className={cn("flex flex-col gap-1", compact ? "min-w-0 flex-1" : "max-w-sm")}>
        <p className={cn("font-semibold", compact && "text-sm")}>{title}</p>
        {description && <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>{description}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          handleFiles(event.target.files);
          // Allow choosing the same file again.
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

type FileDropAreaProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Shown over the content while files are dragged over it. */
  overlayTitle: React.ReactNode;
  overlayDescription?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Makes a whole region (a file list, a page section) accept dropped files, with an overlay while dragging.
 * Drag-and-drop is an extra: always offer a button that opens the file picker as well.
 */
export function FileDropArea({ onFiles, disabled, overlayTitle, overlayDescription, className, children }: FileDropAreaProps) {
  const { dragging, dropProps } = useFileDrop({ onFiles, multiple: true, disabled });
  return (
    <div className={cn("relative", className)} {...dropProps}>
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-accent/90 p-6 text-center text-accent-foreground backdrop-blur-[1px]">
          <UploadIcon className="size-8" aria-hidden="true" />
          <p className="font-semibold">{overlayTitle}</p>
          {overlayDescription && <p className="text-sm">{overlayDescription}</p>}
        </div>
      )}
    </div>
  );
}
