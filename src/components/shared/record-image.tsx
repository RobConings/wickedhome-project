import { useState, type ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One image treatment for identity, photo cards and banners; failed/missing images keep the layout. */
export function RecordImage({ src, alt = "", shape = "card", fit = "cover", fallback, className }: {
  src?: string | null; alt?: string; shape?: "avatar" | "card" | "banner"; fit?: "cover" | "contain";
  fallback?: ReactNode; className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return <div className={cn("relative shrink-0 overflow-hidden bg-muted", shape === "avatar" ? "size-16 rounded-xl" : shape === "banner" ? "h-40 rounded-2xl sm:h-56" : "aspect-[16/10] rounded-xl", fit === "contain" && "bg-white", className)}>
    {src && src !== failed ? <img src={src} alt={alt} loading={shape === "banner" ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={() => setFailed(src)} className={cn("absolute inset-0 size-full", fit === "contain" ? cn("object-contain", shape === "avatar" ? "p-1" : "p-2") : "object-cover")} />
      : <div className="absolute inset-0 grid place-items-center text-muted-foreground">{fallback ?? <ImageIcon className="size-8" aria-hidden="true" />}</div>}
  </div>;
}
