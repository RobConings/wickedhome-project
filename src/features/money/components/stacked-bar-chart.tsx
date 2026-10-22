import * as React from "react";
import { cn } from "@/lib/utils";

export type StackedBarSeries = {
  key: string;
  label: string;
  /**
   * Any CSS colour; use the chart tokens (`var(--chart-1)`…, `var(--chart-income)`, `var(--chart-expense)`,
   * or `var(--section)` for a single series in the page's colour) so light and dark mode follow.
   */
  color: string;
  /** Stack above the baseline (default) or below it, e.g. what leaves versus what comes in. */
  direction?: "up" | "down";
};

export type StackedBarDatum = {
  key: string;
  /** Short label on the x axis. */
  label: string;
  /** Longer label in the tooltip and table (defaults to `label`). */
  title?: string;
  /** Value per series key; null or missing = no data. Always positive, the series direction decides the side. */
  values: Record<string, number | null | undefined>;
};

export type StackedBarChartLabels = {
  showTable: string;
  hideTable: string;
  /** Header of the first table column. */
  category: string;
  /** Tag of projected columns (tooltip, table), with `projectedFrom`. */
  projected?: string;
  /** Label of the `nowKey` marker. */
  now?: string;
};

/** A signed value per column drawn as a line over the bars (e.g. a net result); not stacked. */
export type StackedBarLine = { key: string; label: string; color: string };

type StackedBarChartProps = {
  series: StackedBarSeries[];
  data: StackedBarDatum[];
  /** Formats values for the tooltip, legend and table. */
  formatValue: (value: number) => string;
  /** Formats y-axis ticks (defaults to `formatValue`); pair a unitless tick with `axisLabel`. */
  formatTick?: (value: number) => string;
  /** Unit or name of the y axis, shown above it (e.g. "kWh"). */
  axisLabel?: string;
  /** Accessible name of the chart. */
  title: string;
  labels: StackedBarChartLabels;
  /** A labelled horizontal rule, e.g. a threshold or minimum. Not a series: it never stacks. */
  referenceLine?: { value: number; label: string };
  /** Legend with totals above the plot; on by default for two or more series. */
  showLegend?: boolean;
  /** Totals next to the legend entries (default on); off when a sum over all columns means little. */
  legendTotals?: boolean;
  /** Plot height in px, without the x-axis band. */
  height?: number;
  /** A line over the bars from `values[line.key]` (may be negative), dashed in the projected part. */
  line?: StackedBarLine;
  /** Key of the first projected column: from there on columns are drawn lighter with a dashed outline. */
  projectedFrom?: string;
  /** Key of the column to mark as "now" (a vertical rule with `labels.now`). */
  nowKey?: string;
  /** Extra tooltip content under the values of a column (e.g. a breakdown). */
  renderTooltip?: (datum: StackedBarDatum) => React.ReactNode;
  /**
   * Narrowest column in px: with many columns on a small screen the plot scrolls sideways instead of
   * squeezing, starting at `nowKey`.
   */
  minColumnWidth?: number;
  className?: string;
};

const AXIS_WIDTH = 52;
const AXIS_BAND = 22;
const TOP_PAD = 8;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const MIN_LABEL_SPACING = 40;

/** 1, 2, 2.5 or 5 × 10ⁿ: a step that gives roughly `count` gridlines over `span`. */
function niceStep(span: number, count: number) {
  if (span <= 0) return 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= raw) ?? 10;
  return factor * power;
}

/** A rectangle with rounded corners on one end only: the data end, never the baseline. */
function barPath(x: number, y: number, width: number, height: number, roundTop: boolean, roundBottom: boolean) {
  const r = Math.min(RADIUS, width / 2, height);
  const tr = roundTop ? r : 0;
  const br = roundBottom ? r : 0;
  return [
    `M${x},${y + tr}`,
    tr ? `Q${x},${y} ${x + tr},${y}` : "",
    `H${x + width - tr}`,
    tr ? `Q${x + width},${y} ${x + width},${y + tr}` : "",
    `V${y + height - br}`,
    br ? `Q${x + width},${y + height} ${x + width - br},${y + height}` : "",
    `H${x + br}`,
    br ? `Q${x},${y + height} ${x},${y + height - br}` : "",
    "Z",
  ].join(" ");
}

/** A signed line value: "−€ 120,00" below zero (with a real minus sign), "–" without a value. */
function formatLineValue(amount: number | null, formatValue: (value: number) => string) {
  if (amount === null) return "–";
  return amount < 0 ? `−${formatValue(-amount)}` : formatValue(amount);
}

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Columns of stacked values over time, with series above and below one baseline (e.g. energy in versus
 * energy out). Thin bars with a 2px gap between segments, a legend with totals, a tooltip per column on hover
 * or keyboard focus (← →), and a table view with every value. Optionally a signed line over the bars (e.g. net),
 * a projected part (lighter, dashed, shaded) with a "now" marker, extra tooltip content, and sideways scrolling
 * when there are more columns than fit (`minColumnWidth`).
 */
export function StackedBarChart({
  series,
  data,
  formatValue,
  formatTick = formatValue,
  axisLabel,
  title,
  labels,
  referenceLine,
  line,
  showLegend = series.length > 1 || Boolean(line),
  legendTotals = true,
  height = 220,
  projectedFrom,
  nowKey,
  renderTooltip,
  minColumnWidth,
  className,
}: StackedBarChartProps) {
  const [containerRef, viewportWidth] = useWidth<HTMLDivElement>();
  const [active, setActive] = React.useState<number | null>(null);
  const [showTable, setShowTable] = React.useState(false);
  const tableId = React.useId();
  // With a minimum column width the plot may be wider than its box: it then scrolls sideways.
  const width = minColumnWidth && viewportWidth > 0 ? Math.max(viewportWidth, AXIS_WIDTH + data.length * minColumnWidth) : viewportWidth;

  const up = series.filter((item) => item.direction !== "down");
  const down = series.filter((item) => item.direction === "down");
  const value = (datum: StackedBarDatum, key: string) => Math.max(0, datum.values[key] ?? 0);
  const sum = (datum: StackedBarDatum, list: StackedBarSeries[]) => list.reduce((total, item) => total + value(datum, item.key), 0);
  const lineValue = (datum: StackedBarDatum) => (line ? (datum.values[line.key] ?? null) : null);
  const lineValues = data.map(lineValue).filter((amount): amount is number => amount !== null);
  const projectedIndex = projectedFrom ? data.findIndex((datum) => datum.key === projectedFrom) : -1;
  const isProjected = (index: number) => projectedIndex >= 0 && index >= projectedIndex;
  const nowIndex = nowKey ? data.findIndex((datum) => datum.key === nowKey) : -1;

  const maxUp = Math.max(0, ...data.map((datum) => sum(datum, up)), ...lineValues);
  const maxDown = Math.max(0, ...data.map((datum) => sum(datum, down)), ...lineValues.map((amount) => -amount));
  const step = niceStep(Math.max(maxUp, referenceLine?.value ?? 0) + maxDown, 4);
  const top = Math.max(step, Math.ceil(Math.max(maxUp, referenceLine?.value ?? 0) / step) * step);
  const bottom = down.length || maxDown > 0 ? Math.ceil(maxDown / step) * step : 0;
  const ticks: number[] = [];
  for (let tick = -bottom; tick <= top + step / 2; tick += step) ticks.push(Math.round(tick * 1e6) / 1e6);

  // Start a scrolling plot at "now" (a third in from the left), so the recent past and what comes are in view.
  React.useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || width <= viewportWidth || nowIndex < 0) return;
    const columnX = AXIS_WIDTH + ((width - AXIS_WIDTH) / data.length) * nowIndex;
    element.scrollLeft = Math.max(0, columnX - viewportWidth / 3);
  }, [containerRef, width, viewportWidth, nowIndex, data.length]);

  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const plotHeight = height - TOP_PAD;
  const y = (amount: number) => TOP_PAD + ((top - amount) / (top + bottom)) * plotHeight;
  const band = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.max(2, Math.min(MAX_BAR, band * 0.64));
  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_SPACING / Math.max(band, 1)));
  const totals = series.map((item) => data.reduce((total, datum) => total + value(datum, item.key), 0));

  function segments(datum: StackedBarDatum, list: StackedBarSeries[], direction: 1 | -1) {
    const shown = list.filter((item) => value(datum, item.key) > 0);
    let offset = 0;
    return shown.map((item, index) => {
      const amount = value(datum, item.key);
      const from = y(direction * offset);
      offset += amount;
      const to = y(direction * offset);
      const outer = index === shown.length - 1;
      // The 2px surface gap sits on the side away from the baseline, except on the outermost segment.
      const gap = outer ? 0 : GAP;
      const y0 = direction === 1 ? to + gap : from;
      const h = Math.max(0, Math.abs(to - from) - gap);
      return { item, amount, y: y0, height: h, roundTop: outer && direction === 1, roundBottom: outer && direction === -1 };
    });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!data.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) => Math.min(data.length - 1, Math.max(0, (current ?? (delta > 0 ? -1 : data.length)) + delta)));
    } else if (event.key === "Escape") setActive(null);
  }

  const activeDatum = active !== null ? data[active] : undefined;
  const tooltipLeft = active !== null ? AXIS_WIDTH + band * (active + 0.5) : 0;
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const center = (index: number) => AXIS_WIDTH + band * (index + 0.5);
  const linePath = (points: number[]) =>
    points
      .flatMap((index) => {
        const datum = data[index];
        const amount = datum ? lineValue(datum) : null;
        return amount === null ? [] : [`${center(index)},${y(amount)}`];
      })
      .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
      .join(" ");
  const indices = data.map((_, index) => index);
  const solidPoints = projectedIndex >= 0 ? indices.slice(0, projectedIndex) : indices;
  // The dashed part starts at the last actual point, so the line stays connected.
  const dashedPoints = projectedIndex >= 0 ? indices.slice(Math.max(0, projectedIndex - 1)) : [];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", !showLegend && "sr-only")}>
          {series.map((item, index) => (
            <li key={item.key} className="flex items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span className="text-muted-foreground">{item.label}</span>
              {legendTotals && <span className="font-medium tabular-nums">{formatValue(totals[index] ?? 0)}</span>}
            </li>
          ))}
          {line && (
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} aria-hidden="true" />
              <span className="text-muted-foreground">{line.label}</span>
            </li>
          )}
        </ul>
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? labels.hideTable : labels.showTable}
        </button>
      </div>

      {axisLabel && <p className="-mb-2 text-xs text-muted-foreground">{axisLabel}</p>}
      <div
        ref={containerRef}
        className={cn(
          "relative rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          minColumnWidth && "overflow-x-auto overflow-y-hidden overscroll-x-contain",
        )}
        style={{ height: height + AXIS_BAND }}
        tabIndex={0}
        role="group"
        aria-label={title}
        onKeyDown={handleKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        onScroll={minColumnWidth ? (event) => setScrollLeft(event.currentTarget.scrollLeft) : undefined}
      >
        {width > 0 && (
          <svg width={width} height={height + AXIS_BAND} aria-hidden="true" className="block overflow-visible">
            {projectedIndex >= 0 && (
              <rect
                x={AXIS_WIDTH + band * projectedIndex}
                y={0}
                width={Math.max(0, band * (data.length - projectedIndex))}
                height={height}
                className="fill-muted/60"
              />
            )}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={AXIS_WIDTH}
                  x2={width}
                  y1={y(tick)}
                  y2={y(tick)}
                  className={tick === 0 ? "stroke-muted-foreground/50" : "stroke-border"}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={AXIS_WIDTH - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {formatTick(Math.abs(tick))}
                </text>
              </g>
            ))}

            {referenceLine && (
              <g>
                <line
                  x1={AXIS_WIDTH}
                  x2={width}
                  y1={y(referenceLine.value)}
                  y2={y(referenceLine.value)}
                  className="stroke-muted-foreground"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              </g>
            )}

            {nowIndex >= 0 && (
              <g>
                <line
                  x1={center(nowIndex)}
                  x2={center(nowIndex)}
                  y1={TOP_PAD}
                  y2={height}
                  className="stroke-foreground/60"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  shapeRendering="crispEdges"
                />
                {labels.now && (
                  <text
                    x={center(nowIndex) + 4}
                    y={TOP_PAD + 4}
                    dominantBaseline="hanging"
                    className="fill-foreground stroke-card text-[11px] font-medium"
                    strokeWidth={3}
                    paintOrder="stroke"
                    pointerEvents="none"
                  >
                    {labels.now}
                  </text>
                )}
              </g>
            )}

            {data.map((datum, index) => {
              const x = AXIS_WIDTH + band * index + (band - barWidth) / 2;
              const dimmed = active !== null && active !== index;
              const projected = isProjected(index);
              return (
                <g key={datum.key} opacity={dimmed ? 0.45 : 1} className="transition-opacity">
                  {[...segments(datum, up, 1), ...segments(datum, down, -1)].map((segment) => (
                    <path
                      key={segment.item.key}
                      d={barPath(x, segment.y, barWidth, segment.height, segment.roundTop, segment.roundBottom)}
                      fill={segment.item.color}
                      // Projected: lighter, with a dashed outline.
                      fillOpacity={projected ? 0.4 : 1}
                      stroke={projected ? segment.item.color : undefined}
                      strokeDasharray={projected ? "2 2" : undefined}
                      strokeWidth={projected ? 1 : undefined}
                    />
                  ))}
                  {index % labelEvery === 0 && (
                    <text
                      x={AXIS_WIDTH + band * (index + 0.5)}
                      y={height + AXIS_BAND - 4}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px] tabular-nums"
                    >
                      {datum.label}
                    </text>
                  )}
                  {/* Hit target: the whole column, not just the painted bar. */}
                  <rect
                    x={AXIS_WIDTH + band * index}
                    y={0}
                    width={band}
                    height={height}
                    fill="transparent"
                    onPointerEnter={() => setActive(index)}
                    onPointerDown={() => setActive(index)}
                  />
                </g>
              );
            })}
            {line && (
              <g pointerEvents="none">
                {solidPoints.length > 1 && <path d={linePath(solidPoints)} fill="none" stroke={line.color} strokeWidth={2} strokeLinejoin="round" />}
                {dashedPoints.length > 1 && (
                  <path d={linePath(dashedPoints)} fill="none" stroke={line.color} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
                )}
                {data.map((datum, index) => {
                  const amount = lineValue(datum);
                  if (amount === null) return null;
                  const projected = isProjected(index);
                  return (
                    <circle
                      key={datum.key}
                      cx={center(index)}
                      cy={y(amount)}
                      r={active === index ? 4 : 2.5}
                      fill={projected ? "var(--card)" : line.color}
                      stroke={line.color}
                      strokeWidth={projected ? 1.5 : 0}
                    />
                  );
                })}
              </g>
            )}
            {referenceLine && (
              <text
                x={width}
                y={y(referenceLine.value) - 4}
                textAnchor="end"
                className="fill-muted-foreground stroke-card text-[11px] font-medium"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {referenceLine.label}
              </text>
            )}
          </svg>
        )}

        {activeDatum && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
            style={{
              left: tooltipLeft,
              transform: `translateX(${tooltipLeft - scrollLeft > (minColumnWidth ? viewportWidth : width) / 2 ? "calc(-100% - 12px)" : "12px"})`,
            }}
            role="status"
          >
            <p className="mb-1 text-xs text-muted-foreground">
              {activeDatum.title ?? activeDatum.label}
              {active !== null && isProjected(active) && labels.projected ? ` · ${labels.projected}` : ""}
            </p>
            <ul className="flex flex-col gap-0.5">
              {series.map((item) => {
                const amount = activeDatum.values[item.key];
                return (
                  <li key={item.key} className="flex items-center gap-2">
                    <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                    <span className="font-semibold tabular-nums">{amount == null ? "–" : formatValue(amount)}</span>
                    <span className="text-muted-foreground">{item.label}</span>
                  </li>
                );
              })}
              {line && (
                <li className="flex items-center gap-2 border-t pt-0.5">
                  <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: line.color }} aria-hidden="true" />
                  <span className="font-semibold tabular-nums">{formatLineValue(lineValue(activeDatum), formatValue)}</span>
                  <span className="text-muted-foreground">{line.label}</span>
                </li>
              )}
            </ul>
            {renderTooltip?.(activeDatum)}
          </div>
        )}
      </div>

      <div id={tableId} className={showTable ? "max-h-80 overflow-auto rounded-md border" : "sr-only"}>
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {labels.category}
              </th>
              {series.map((item) => (
                <th key={item.key} scope="col" className="px-3 py-2 text-right font-medium">
                  {item.label}
                </th>
              ))}
              {line && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {line.label}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((datum, index) => (
              <tr key={datum.key} className={cn("border-t", isProjected(index) && "text-muted-foreground")}>
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  {datum.title ?? datum.label}
                  {isProjected(index) && labels.projected ? ` (${labels.projected})` : ""}
                </th>
                {series.map((item) => {
                  const amount = datum.values[item.key];
                  return (
                    <td key={item.key} className="px-3 py-1.5 text-right tabular-nums">
                      {amount == null ? "–" : formatValue(amount)}
                    </td>
                  );
                })}
                {line && <td className="px-3 py-1.5 text-right tabular-nums">{formatLineValue(lineValue(datum), formatValue)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
