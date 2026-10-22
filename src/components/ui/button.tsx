import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 data-loading:[&>svg:not([data-slot=spinner])]:hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Phones (below `sm`): full width, at least 40 px tall, and the label wraps onto more lines instead of
 * running out of the button. For text buttons inside cards, sections, empty states and dialogs.
 */
const fullOnMobileClasses =
  "max-sm:h-auto max-sm:min-h-10 max-sm:w-full max-sm:max-w-full max-sm:py-2 max-sm:text-center max-sm:whitespace-normal"

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  fullOnMobile = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Busy: disabled, with a spinner in place of its icon (or before its text). Not for `asChild`. */
    loading?: boolean
    /**
     * On phones: full width, wraps its label, grows in height (docs/ADDING-A-FEATURE.md, "Phone first").
     * Use for text buttons in cards and sections; not for icon buttons or toolbars.
     */
    fullOnMobile?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const busy = loading && !asChild

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={busy || undefined}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(buttonVariants({ variant, size }), fullOnMobile && fullOnMobileClasses, className)}
      {...props}
    >
      {/* Slot needs exactly one child, so `asChild` gets its children untouched. */}
      {asChild ? children : (
        <>
          {busy && <Spinner />}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
