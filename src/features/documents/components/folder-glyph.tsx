import { FolderIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type FolderGlyphProps = {
  /** `#rrggbb`; the brand colour when not set. */
  color?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = { sm: "size-4", md: "size-6", lg: "size-10" };

/** A folder icon in the folder's own colour. */
export function FolderGlyph({ color, size = "md", className }: FolderGlyphProps) {
  return (
    <FolderIcon
      className={cn("shrink-0", SIZE[size], !color && "text-primary", className)}
      style={color ? { color } : undefined}
      fill="currentColor"
      fillOpacity={0.18}
      aria-hidden="true"
    />
  );
}
