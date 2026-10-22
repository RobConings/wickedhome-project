import { cva, type VariantProps } from "class-variance-authority";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/*
 * The WickedHome logo: house outline, leaf and dot. Colours come from the brand tokens, so the mark
 * switches to its inverse variant (white house, light leaf) in dark mode by itself.
 * Static copies for favicons and app icons live in public/brand/.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path
        d="M12 30 30 14.2a3 3 0 0 1 4 0L52 30v19a7 7 0 0 1-7 7H19a7 7 0 0 1-7-7z"
        fill="none"
        strokeWidth="6"
        strokeLinejoin="round"
        className="stroke-brand-ink"
      />
      <circle cx="49.5" cy="11" r="5.5" className="fill-brand-leaf" />
      <path d="M18.5 51.5c-1.5-14.5 8-24.5 25-25.5 1 15.5-8.5 24.5-25 25.5z" className="fill-brand-leaf" />
      <path d="M19.5 50.5C26 43 32 37 38.5 31.5" fill="none" strokeWidth="2.2" strokeLinecap="round" className="stroke-card" />
    </svg>
  );
}

const brandMarkVariants = cva("inline-flex shrink-0 items-center font-bold tracking-tight", {
  variants: {
    size: {
      sm: "gap-2 text-base [&_svg]:size-7",
      md: "gap-2.5 text-lg [&_svg]:size-8",
      lg: "gap-3 text-3xl [&_svg]:size-12",
    },
  },
  defaultVariants: { size: "md" },
});

type BrandMarkProps = VariantProps<typeof brandMarkVariants> & {
  /** Hide the word mark and only show the logo. */
  iconOnly?: boolean;
  /** Show "Your home. Together." under the word mark. */
  withTagline?: boolean;
  className?: string;
};

export function BrandMark({ size, iconOnly = false, withTagline = false, className }: BrandMarkProps) {
  const { t } = useTranslation();
  return (
    <span className={cn(brandMarkVariants({ size }), className)}>
      <LogoMark />
      {iconOnly ? (
        <span className="sr-only">WickedHome</span>
      ) : (
        <span className="flex flex-col leading-none">
          <span>
            <span className="text-brand-ink">Wicked</span>
            <span className="text-brand-leaf">Home</span>
          </span>
          {withTagline && (
            <span className="mt-1.5 text-[0.55em] font-medium tracking-[0.3em] text-muted-foreground uppercase">
              {t("brand.tagline")}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
