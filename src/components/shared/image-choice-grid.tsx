import { CheckIcon, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ImageChoicesLabels = { empty: string; clear: string; use: (name: string) => string; remove: (name: string) => string };
export function ImageChoiceGrid({ images, selectedId, onSelect, disabled, labels }: {
  images: { id: string; name: string; url: string }[]; selectedId: string | null;
  onSelect: (id: string | null) => void; disabled?: boolean; labels: ImageChoicesLabels;
}) {
  if (!images.length) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><ImageIcon className="size-4 shrink-0" aria-hidden="true" />{labels.empty}</p>;
  return <div className="flex flex-col gap-2"><div className="flex flex-wrap gap-2">
    {images.map((image) => <button key={image.id} type="button" disabled={disabled}
      aria-pressed={selectedId === image.id} aria-label={selectedId === image.id ? labels.remove(image.name) : labels.use(image.name)}
      onClick={() => onSelect(selectedId === image.id ? null : image.id)}
      className={cn("relative size-20 overflow-hidden rounded-xl border-2 bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", selectedId === image.id ? "border-section" : "border-transparent")}>
      <img src={image.url} alt="" loading="lazy" className="size-full object-cover" />
      {selectedId === image.id && <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-3" /></span>}
    </button>)}
  </div>{selectedId && !disabled && <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => onSelect(null)}>{labels.clear}</Button>}</div>;
}
