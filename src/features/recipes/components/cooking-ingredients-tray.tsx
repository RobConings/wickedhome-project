import type { ReactNode } from "react";
import { ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Mobile ingredients stay within reach while leaving room for the assistant and device safe areas. */
export function CookingIngredientsTray({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return <>
    <div className="h-20 lg:hidden" aria-hidden="true" />
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pt-3 pr-[calc(max(1rem,env(safe-area-inset-right))+3.5rem)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur lg:hidden print:hidden">
      <Sheet>
        <SheetTrigger asChild><Button size="lg" variant="secondary" className="h-12 w-full justify-between"><span className="truncate">{label}</span><ChevronUpIcon aria-hidden="true" /></Button></SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{label}</SheetDescription></SheetHeader>
          <div className="px-4">{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  </>;
}
