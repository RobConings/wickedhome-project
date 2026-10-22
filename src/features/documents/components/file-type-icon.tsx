import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "pdf" | "image" | "video" | "audio" | "spreadsheet" | "document" | "archive" | "code" | "other";

const EXTENSIONS: Record<string, Kind> = {
  pdf: "pdf",
  csv: "spreadsheet",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ods: "spreadsheet",
  numbers: "spreadsheet",
  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  txt: "document",
  md: "document",
  pages: "document",
  zip: "archive",
  "7z": "archive",
  rar: "archive",
  tar: "archive",
  gz: "archive",
  json: "code",
  xml: "code",
  html: "code",
  heic: "image",
};

function kindOf(mimeType: string, name?: string): Kind {
  const [type = "", subtype = ""] = mimeType.toLowerCase().split("/");
  if (subtype === "pdf") return "pdf";
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  if (/csv|spreadsheet|excel/.test(subtype)) return "spreadsheet";
  if (/word|opendocument\.text|rtf/.test(subtype) || type === "text") {
    return subtype === "html" || subtype === "xml" ? "code" : "document";
  }
  if (/zip|compressed|tar|gzip|rar/.test(subtype)) return "archive";
  if (/json|xml/.test(subtype)) return "code";
  const extension = name?.split(".").pop()?.toLowerCase();
  return (extension && EXTENSIONS[extension]) || "other";
}

const LOOK: Record<Kind, { icon: LucideIcon; bg: string; text: string }> = {
  pdf: { icon: FileTextIcon, bg: "bg-destructive/10", text: "text-destructive" },
  image: { icon: FileImageIcon, bg: "bg-chart-5/15", text: "text-chart-5" },
  video: { icon: FileVideoIcon, bg: "bg-info/10", text: "text-info" },
  audio: { icon: FileAudioIcon, bg: "bg-chart-4/15", text: "text-chart-4" },
  spreadsheet: { icon: FileSpreadsheetIcon, bg: "bg-success/10", text: "text-success" },
  document: { icon: FileTextIcon, bg: "bg-info/10", text: "text-info" },
  archive: { icon: FileArchiveIcon, bg: "bg-warning/10", text: "text-warning" },
  code: { icon: FileCodeIcon, bg: "bg-muted", text: "text-muted-foreground" },
  other: { icon: FileIcon, bg: "bg-muted", text: "text-muted-foreground" },
};

type FileTypeIconProps = {
  mimeType: string;
  /** File name; its extension helps when the mime type is generic (`application/octet-stream`). */
  name?: string;
  /** `tile`: the icon on a tinted square, for lists and cards. `icon`: just the glyph. */
  variant?: "icon" | "tile";
  size?: "sm" | "md" | "lg";
  className?: string;
};

const TILE_SIZE = { sm: "size-8 rounded-md [&>svg]:size-4", md: "size-10 rounded-lg [&>svg]:size-5", lg: "size-14 rounded-xl [&>svg]:size-7" };
const ICON_SIZE = { sm: "size-4", md: "size-5", lg: "size-7" };

/** An icon that says what kind of file this is: PDF, image, spreadsheet, archive… */
export function FileTypeIcon({ mimeType, name, variant = "tile", size = "md", className }: FileTypeIconProps) {
  const { icon: Icon, bg, text } = LOOK[kindOf(mimeType, name)];
  if (variant === "icon") {
    return <Icon className={cn(ICON_SIZE[size], text, className)} aria-hidden="true" />;
  }
  return (
    <span className={cn("grid shrink-0 place-items-center", TILE_SIZE[size], bg, text, className)} aria-hidden="true">
      <Icon />
    </span>
  );
}
