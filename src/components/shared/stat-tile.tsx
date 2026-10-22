import type * as React from "react";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { isSectionAccent } from "@/lib/section-accent";
import { cn } from "@/lib/utils";
import { IconChip, type IconChipTone } from "./icon-chip";

/**
 * What a tile is about, as colour (docs/BRANDING.md). `default` and `featured` use the current section's
 * accent; the others are semantic: `positive` (all done, savings), `negative` (overdue, over budget),
 * `warning` (at risk, waiting), `soon` (due soon), `info` (upcoming, next period), `highlight` (peach:
 * money due, "needs you"), `neutral` (nothing to say, unavailable).
 */
export type StatTileTone = "default" | "featured" | "positive" | "negative" | "warning" | "soon" | "info" | "highlight" | "neutral";

type ToneColours = { solid: string; soft: string; border: string; text: string; icon?: string };

const TONES: Record<StatTileTone, ToneColours> = {
  default: { solid: "--section", soft: "--section-soft", border: "--section-border", text: "--section-foreground" },
  featured: { solid: "--section", soft: "--section-soft", border: "--section-border", text: "--section-foreground" },
  positive: { solid: "--success", soft: "--success-soft", border: "--success-border", text: "--success-foreground" },
  negative: { solid: "--danger", soft: "--danger-soft", border: "--danger-border", text: "--danger-foreground" },
  warning: { solid: "--warning", soft: "--warning-soft", border: "--warning-border", text: "--warning-foreground" },
  soon: { solid: "--soon", soft: "--soon-soft", border: "--soon-border", text: "--soon-foreground" },
  info: { solid: "--info", soft: "--info-soft", border: "--info-border", text: "--info-foreground" },
  highlight: { solid: "--highlight-strong", soft: "--highlight-soft", border: "--highlight-strong", text: "--highlight-foreground", icon: "--highlight-strong" },
  neutral: { solid: "--muted-foreground", soft: "--muted", border: "--border", text: "--muted-foreground" },
};

/** The tone's colours as local CSS variables, used by the classes below (`--tile`, `--tile-soft`…). */
function toneStyle(tone: StatTileTone): React.CSSProperties {
  const colours = TONES[tone];
  return {
    "--tile": `var(${colours.solid})`,
    "--tile-soft": `var(${colours.soft})`,
    "--tile-border": `var(${colours.border})`,
    "--tile-text": `var(${colours.text})`,
    "--tile-icon": `var(${colours.icon ?? colours.solid})`,
  } as React.CSSProperties;
}

type StatTileProps = {
  label: React.ReactNode;
  /** The figure itself, already formatted. */
  value: React.ReactNode;
  /** Small line under the value, e.g. a comparison or a breakdown; shown in the tone's colour. */
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /**
   * Default: the current section. Pick a semantic tone when the figure itself means something (overdue > 0
   * → `negative`, nothing overdue → `positive`); `featured` for the page's key figure (one per row).
   */
  tone?: StatTileTone | null;
  /**
   * A section name (e.g. "tasks" on the dashboard) colours the whole tile in that section's accent; another
   * chip tone only recolours the icon chip.
   */
  iconTone?: IconChipTone;
  /** Makes the whole tile a link, with a chevron. */
  to?: string;
  className?: string;
};

/** One key figure with a label and a coloured icon chip, for summary rows at the top of a page. */
export function StatTile({ label, value, hint, icon: Icon, iconTone, to, tone, className }: StatTileProps) {
  const resolved: StatTileTone = tone ?? "default";
  const featured = resolved === "featured";
  // A tile about another section (e.g. Tasks on the dashboard) takes that section's colour throughout.
  const accent = isSectionAccent(iconTone) ? iconTone : undefined;
  const ownChip = iconTone && !accent && (resolved === "default" || resolved === "featured");

  const content = (
    <>
      {(Icon || to) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {Icon ? (
            ownChip ? (
              <IconChip icon={Icon} tone={iconTone} />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5",
                  featured ? "bg-[color:var(--tile)] text-card" : "bg-[color:var(--tile-soft)] text-[color:var(--tile-icon)]",
                )}
              >
                <Icon />
              </span>
            )
          ) : (
            <span />
          )}
          {to && (
            <ChevronRightIcon
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          )}
        </div>
      )}
      {/* Labels, figures and hints wrap rather than being cut off or widening the tile. */}
      <span className="text-sm break-words text-muted-foreground">{label}</span>
      <p data-slot="stat-value" className="text-2xl font-semibold tracking-tight break-words text-foreground tabular-nums">
        {value}
      </p>
      {hint && <p className="text-xs font-medium break-words text-pretty text-[color:var(--tile-text)]">{hint}</p>}
    </>
  );

  const classes = cn(
    "relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl border p-4 text-card-foreground shadow-xs",
    featured
      ? // The key figure: a full soft fill in the accent, with an accent border.
        "border-[color:var(--tile-border)] bg-[color:var(--tile-soft)]"
      : // Others: a card with a soft wash of the tone at the top and a thin accent edge.
        "bg-card bg-[linear-gradient(to_bottom,var(--tile-soft),var(--card)_70%)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--tile)] before:opacity-70",
    resolved !== "default" && !featured && "border-[color:var(--tile-border)]",
    to && "group outline-none transition-colors hover:border-[color:var(--tile)] focus-visible:ring-[3px] focus-visible:ring-ring/50",
    className,
  );
  const style = toneStyle(resolved);
  return to ? (
    <Link to={to} data-accent={accent} data-tone={resolved} style={style} className={classes}>
      {content}
    </Link>
  ) : (
    <div data-accent={accent} data-tone={resolved} style={style} className={classes}>
      {content}
    </div>
  );
}
