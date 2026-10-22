import * as React from "react";

type UseFileDropOptions = {
  onFiles: (files: File[]) => void;
  /** Keep only the first file when false. */
  multiple?: boolean;
  disabled?: boolean;
};

const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

/**
 * Drag-and-drop of files onto any element: spread `dropProps` on it and use `dragging` for the highlight.
 * Counts enter/leave so moving over child elements doesn't flicker, and ignores drags that carry no files
 * (text, links, elements being reordered).
 */
export function useFileDrop({ onFiles, multiple = true, disabled = false }: UseFileDropOptions) {
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);

  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };

  const dropProps = {
    onDragEnter: (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      reset();
      const files = Array.from(event.dataTransfer.files);
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
  };

  return { dragging: dragging && !disabled, dropProps };
}
