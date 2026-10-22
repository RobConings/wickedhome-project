import type * as React from "react";
import { cn } from "@/lib/utils";

/** Full-height page with one centred column, e.g. login and setup. */
export function CenteredLayout({ className, children, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)] px-4 py-10",
        className,
      )}
      {...props}
    >
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
