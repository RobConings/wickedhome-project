import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Two independently accessible actions: primary action and an overlay menu of related actions. */
export function SplitAction({
  icon: Icon,
  label,
  menuLabel,
  onClick,
  busy = false,
  disabled = false,
  menu,
  variant = "default",
  className,
  renderPrimary,
  menuTriggerRef,
  onMenuCloseAutoFocus,
}: {
  icon: LucideIcon;
  label: string;
  menuLabel: string;
  onClick?: () => void;
  /** Wrap the primary button in an owner form/confirmation without changing its button semantics. */
  renderPrimary?: (button: React.ReactElement) => React.ReactNode;
  menuTriggerRef?: React.Ref<HTMLButtonElement>;
  onMenuCloseAutoFocus?: React.ComponentProps<typeof DropdownMenuContent>["onCloseAutoFocus"];
  busy?: boolean;
  disabled?: boolean;
  menu: React.ReactNode;
  variant?: "default" | "outline";
  className?: string;
}) {
  const primary = <Button type="button" variant={variant} loading={busy} disabled={disabled} onClick={onClick} className={cn("h-11 min-w-0 flex-1 px-3 sm:h-9", menu && "rounded-r-none")}><Icon /><span className="truncate">{label}</span></Button>;
  return (
    <div className={cn("flex min-w-0 max-w-full", className)}>
      {renderPrimary ? renderPrimary(primary) : primary}
      {menu && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            ref={menuTriggerRef}
            disabled={disabled}
            aria-label={menuLabel}
            title={menuLabel}
            className="h-11 w-11 shrink-0 rounded-l-none border-l border-current/15 px-2 sm:h-9 sm:w-9"
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52" onCloseAutoFocus={onMenuCloseAutoFocus}>
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  );
}
