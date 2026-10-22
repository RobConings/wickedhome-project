import type { CSSProperties } from "react";
import type { CalendarEntry } from "../types/calendar";
import { zonedParts } from "../types/calendar-time";
import { entryDates, isMultiDay } from "./calendar-format";

export type PositionedEntry = {
  entry: CalendarEntry;
  /** Minutes since midnight, clipped to the day. */
  startMinute: number;
  endMinute: number;
  /** Side-by-side placement among overlapping entries. */
  column: number;
  columns: number;
};

const DAY_MINUTES = 24 * 60;
/** Very short events still get a clickable height. */
const MIN_DURATION = 20;

/**
 * Places the timed entries of one day in a time grid: start/end in minutes (clipped to the day) and, for
 * entries that overlap, a column so they sit side by side instead of on top of each other.
 */
export function layoutDay(entries: CalendarEntry[], date: string): PositionedEntry[] {
  const items = entries
    .filter((entry) => !entry.allDay)
    .map((entry) => {
      const start = zonedParts(entry.start);
      const end = zonedParts(entry.end);
      const startMinute = start.date < date ? 0 : start.minutes;
      const endMinute = end.date > date ? DAY_MINUTES : end.minutes;
      return { entry, startMinute, endMinute: Math.max(endMinute, startMinute + MIN_DURATION), column: 0, columns: 1 };
    })
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);

  // Group entries into clusters of transitive overlap, then give each a free column within its cluster.
  let cluster: PositionedEntry[] = [];
  let clusterEnd = -1;
  const finish = () => {
    const columns = Math.max(1, ...cluster.map((item) => item.column + 1));
    for (const item of cluster) item.columns = columns;
    cluster = [];
  };
  for (const item of items) {
    if (item.startMinute >= clusterEnd) {
      finish();
      clusterEnd = -1;
    }
    const taken = new Set(cluster.filter((other) => other.endMinute > item.startMinute).map((other) => other.column));
    let column = 0;
    while (taken.has(column)) column++;
    item.column = column;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMinute);
  }
  finish();
  return items;
}

/** Height of one lane of multi-day bars: a 24px bar plus a 4px gap. */
export const SPAN_LANE_HEIGHT = 28;

export type SpanSegment = {
  entry: CalendarEntry;
  /** Columns of the first and last covered day within the row (0-based, inclusive). */
  startColumn: number;
  endColumn: number;
  /** Row of bars, from the top; overlapping entries get different lanes. */
  lane: number;
  /** The entry began before / goes on after the row: that end is drawn square. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Lays out the multi-day entries over a row of consecutive `days` (a week): one segment per entry, clipped
 * to the row, stacked in lanes so overlapping entries don't collide. Earlier and longer entries get the
 * upper lanes; a lane is reused once the previous bar in it has ended.
 */
export function layoutSpans(entries: CalendarEntry[], days: string[]): { segments: SpanSegment[]; lanes: number } {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return { segments: [], lanes: 0 };
  const segments: SpanSegment[] = entries
    .filter((entry) => isMultiDay(entry))
    .flatMap((entry) => {
      const { from, to } = entryDates(entry);
      if (to < first || from > last) return [];
      return [
        {
          entry,
          startColumn: from < first ? 0 : days.indexOf(from),
          endColumn: to > last ? days.length - 1 : days.indexOf(to),
          lane: 0,
          continuesBefore: from < first,
          continuesAfter: to > last,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.startColumn - b.startColumn ||
        b.endColumn - b.startColumn - (a.endColumn - a.startColumn) ||
        a.entry.title.localeCompare(b.entry.title),
    );

  const laneEnds: number[] = [];
  for (const segment of segments) {
    let lane = laneEnds.findIndex((end) => end < segment.startColumn);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.endColumn;
    segment.lane = lane;
  }
  return { segments, lanes: laneEnds.length };
}

/** Absolute position of a bar in a row of `columns` equal day columns; `top` is where the first lane starts. */
export function spanBarStyle(segment: SpanSegment, { top, columns = 7 }: { top: number; columns?: number }): CSSProperties {
  const left = (segment.startColumn / columns) * 100;
  const width = ((segment.endColumn - segment.startColumn + 1) / columns) * 100;
  const insetLeft = segment.continuesBefore ? 0 : 4;
  const insetRight = segment.continuesAfter ? 0 : 4;
  return {
    top: top + segment.lane * SPAN_LANE_HEIGHT,
    left: `calc(${left}% + ${insetLeft}px)`,
    width: `calc(${width}% - ${insetLeft + insetRight}px)`,
  };
}
