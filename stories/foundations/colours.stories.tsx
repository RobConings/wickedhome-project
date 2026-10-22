import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BanknoteIcon,
  BotIcon,
  CalendarDaysIcon,
  CpuIcon,
  FolderIcon,
  HouseIcon,
  ListChecksIcon,
  PlugIcon,
  ShoppingCartIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "../../src/app/components/card";
import { IconChip } from "../../src/app/components/icon-chip";
import { StatTile } from "../../src/app/components/stat-tile";
import { SECTION_ACCENTS, type SectionAccent } from "../../src/app/lib/section-accent";

/**
 * The colour system (docs/BRANDING.md): surfaces, the one call-to-action colour, the peach highlight,
 * semantic status colours and the section accents. Switch the toolbar's **Theme** to compare light and
 * dark; "Side by side" shows both at once (keep the toolbar on Light for that one).
 */
const meta = {
  title: "Foundations/Colours",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The resolved value of a CSS variable on an element, e.g. "#124734". */
function useResolved(token: string) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    const update = () => ref.current && setValue(getComputedStyle(ref.current).getPropertyValue(token).trim());
    update();
    // Re-read when the toolbar switches theme or accent (both are attributes on <html>).
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [token]);
  return [ref, value] as const;
}

function Swatch({ token, label }: { token: string; label?: string }) {
  const [ref, value] = useResolved(token);
  return (
    <div ref={ref} className="flex min-w-0 items-center gap-2">
      <span className="size-9 shrink-0 rounded-lg border shadow-xs" style={{ background: `var(${token})` }} />
      <span className="flex min-w-0 flex-col leading-tight">
        <code className="truncate text-xs font-medium">{label ?? token}</code>
        <span className="text-[11px] text-muted-foreground tabular-nums">{value}</span>
      </span>
    </div>
  );
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const SURFACES = ["--background", "--card", "--elevated", "--muted", "--border", "--foreground", "--muted-foreground", "--sidebar"];
const SEMANTIC = ["success", "warning", "soon", "danger", "info"] as const;
const SECTION_ICONS: Record<SectionAccent, LucideIcon> = {
  home: HouseIcon,
  tasks: ListChecksIcon,
  shopping: ShoppingCartIcon,
  calendar: CalendarDaysIcon,
  energy: ZapIcon,
  finance: BanknoteIcon,
  documents: FolderIcon,
  devices: CpuIcon,
  assistant: BotIcon,
  integrations: PlugIcon,
};

function Palette() {
  return (
    <div className="flex flex-col gap-8 rounded-2xl bg-background p-5 text-foreground">
      <Group title="Surfaces" description="Page < card < elevated. Dark mode is neutral-leaning so the accents carry the colour.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACES.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </Group>

      <Group
        title="Call to action and highlight"
        description="Primary = the one CTA colour (deep green in light, luminous mint in dark). Highlight (peach) = today, selected, new, needs you."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch token="--primary" />
          <Swatch token="--primary-foreground" />
          <Swatch token="--highlight" />
          <Swatch token="--highlight-strong" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Log expense</Button>
          <Button variant="outline">Add</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Badge variant="highlight">3 new</Badge>
          <Card tone="attention" className="p-3 text-sm">Suggested from mail: needs you</Card>
        </div>
      </Group>

      <Group
        title="Semantic status"
        description="Solid (icons, bars, text on cards), soft (badge fill), border, foreground (badge text). All text pairs are WCAG AA."
      >
        <div className="flex flex-col gap-3">
          {SEMANTIC.map((name) => (
            <div key={name} className="grid grid-cols-2 items-center gap-3 sm:grid-cols-5">
              <Swatch token={`--${name}`} />
              <Swatch token={`--${name}-soft`} />
              <Swatch token={`--${name}-border`} />
              <Swatch token={`--${name}-foreground`} />
              <Badge variant={name}>{name}</Badge>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Upcoming</Badge>
            <Badge variant="soon">Due soon</Badge>
            <Badge variant="danger">Overdue</Badge>
            <Badge variant="success">Paid</Badge>
            <Badge variant="warning">On hold</Badge>
            <Badge variant="info">Waiting</Badge>
          </div>
        </div>
      </Group>

      <Group
        title="Section accents"
        description="One hue per area of the app, set with data-accent by the frame from the route. Components use --section*, so features never pick a colour."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SECTION_ACCENTS.map((accent) => (
            <div key={accent} data-accent={accent} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <IconChip icon={SECTION_ICONS[accent]} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-section-foreground">{accent}</span>
                  <Badge variant="section">active</Badge>
                </div>
                <Progress value={62} label={accent} />
              </div>
            </div>
          ))}
        </div>
      </Group>

      <Group title="Stat tiles" description="Default = section accent; featured = the page's key figure; semantic tones when the figure means something.">
        <div data-accent="finance" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="This month" value="€ 5.917,80" hint="€ 4.034,54 still to pay" icon={CalendarDaysIcon} tone="featured" />
          <StatTile label="Next month" value="€ 3.660,56" hint="12 items" icon={CalendarDaysIcon} tone="info" />
          <StatTile label="Overdue" value="€ 0,00" hint="Nothing overdue" icon={ListChecksIcon} tone="positive" />
        </div>
      </Group>

      <Group title="Charts" description="Fixed order, never cycled. Income = slot 2 (green), expenses = slot 3 (coral).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
            <Swatch key={slot} token={`--chart-${slot}`} />
          ))}
          <Swatch token="--chart-income" />
          <Swatch token="--chart-expense" />
        </div>
      </Group>
    </div>
  );
}

/** Every token in the current theme (switch Theme in the toolbar). */
export const Tokens: Story = { render: () => <Palette /> };

/** Light and dark next to each other (keep the toolbar on Light). */
export const SideBySide: Story = {
  render: () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <Palette />
      <div className="dark">
        <Palette />
      </div>
    </div>
  ),
};
