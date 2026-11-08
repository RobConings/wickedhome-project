import * as React from "react";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const wideScreen = () => window.matchMedia("(min-width: 1024px)").matches;
const subscribeWidth = (changed: () => void) => {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

/** Selection details overlay the canvas; a phone sheet leaves the map visible above it. */
export function MapInspector({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const desktop = React.useSyncExternalStore(subscribeWidth, wideScreen, () => false);
  const { t } = useTranslation();
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (!open || !desktop) return;
    const previous = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, desktop, onClose]);
  if (!desktop) return <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto rounded-t-2xl p-5">
      <SheetHeader className="p-0 pr-10"><SheetTitle>{title}</SheetTitle></SheetHeader>
      {children}
    </SheetContent>
  </Sheet>;
  if (!open) return null;
  return <aside ref={ref} tabIndex={-1} aria-label={title} className="absolute inset-y-4 right-4 z-20 flex w-96 max-w-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto rounded-2xl border bg-card/95 p-5 shadow-xl outline-none backdrop-blur">
    <div className="flex items-center justify-between gap-2"><h2 className="min-w-0 text-lg font-semibold break-words">{title}</h2><Button variant="ghost" size="icon" aria-label={t("actions.close")} onClick={onClose}><XIcon /></Button></div>
    {children}
  </aside>;
}
