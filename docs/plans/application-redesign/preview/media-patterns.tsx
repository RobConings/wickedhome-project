import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ImageIcon } from "lucide-react";

/** Design assets only. Production reuses saved cover/image references from each owner. */
const media: Record<
  string,
  { src: string; position: string; contain?: boolean }
> = {
  bathroom: {
    src: new URL("./media/bathroom.jpg", import.meta.url).href,
    position: "50% 58%",
  },
  pasta: {
    src: new URL("./media/pasta.jpg", import.meta.url).href,
    position: "50% 70%",
  },
  laundry: {
    src: new URL("./media/laundry.jpg", import.meta.url).href,
    position: "50% 65%",
  },
  milk: {
    src: new URL("./media/milk.jpg", import.meta.url).href,
    position: "50% 50%",
    contain: true,
  },
};

type Props = {
  mediaKey?: string | null;
  alt: string;
  shape: "banner" | "tile" | "thumbnail" | "identity";
  icon?: LucideIcon;
};
/** Composes the existing image regions used by ProjectTile/RecipeTile; this is not a production component. */
export function RecordPhoto({
  mediaKey,
  alt,
  shape,
  icon: Icon = ImageIcon,
}: Props) {
  const photo = mediaKey ? media[mediaKey] : undefined;
  const [failed, setFailed] = useState<string | null>(null);
  const show = photo && failed !== photo.src;
  const sizes = {
    banner: "h-40 w-full rounded-xl sm:h-52",
    tile: "h-44 w-full sm:h-48",
    thumbnail: "size-12 shrink-0 rounded-lg",
    identity: "h-48 w-full rounded-xl sm:w-52",
  };
  return (
    <div
      className={`relative grid place-items-center overflow-hidden bg-section-soft text-section ${sizes[shape]}`}
      data-record-media={mediaKey || "fallback"}
    >
      {show ? (
        <img
          src={photo.src}
          alt={alt}
          className={`absolute inset-0 h-full w-full ${photo.contain ? "bg-card object-contain p-3" : "object-cover"}`}
          style={{ objectPosition: photo.position }}
          loading={shape === "banner" ? "eager" : "lazy"}
          onError={() => setFailed(photo.src)}
        />
      ) : (
        <Icon
          className={shape === "thumbnail" ? "size-6" : "size-12"}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
