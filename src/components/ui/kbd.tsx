import * as React from "react";
import { cn } from "@/lib/utils";

/** A keyboard key in a shortcut hint ("N", "⌘K"). Purely visual; hidden on touch-only screens by the caller if needed. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground select-none",
        className,
      )}
      {...props}
    />
  );
}

/** A shortcut of one or more keys pressed one after the other ("N" then "T"). */
function KbdGroup({ keys, className, kbdClassName }: { keys: string[]; className?: string; kbdClassName?: string }) {
  return (
    <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key, index) => (
        <Kbd key={`${key}-${index}`} className={kbdClassName}>
          {key}
        </Kbd>
      ))}
    </span>
  );
}

export { Kbd, KbdGroup };
