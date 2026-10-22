import { parseBelgianNumber } from "./plan-length";

// Room labels on an architect's plan: a name and an area ("Keuken" over "12,65 m2", or on one line).
// Pure functions (unit tested); the PDF text extraction lives in plan-pdf.ts.

/** A piece of text from the PDF, in underlay units with y down: left, top, width and height. */
export type PlanTextItem = { str: string; x: number; y: number; width: number; height: number };

/** A detected label; `u`/`v` is its centre in the same units as the items. */
export type DetectedLabel = { name: string; areaM2: number | null; u: number; v: number };

const AREA_PATTERN = /(\d{1,5}(?:[.,]\d{1,3})*)\s*m\s?(?:2|²)(?!\d)/i;

/** `12,65 m2`, `12.65m²`, `8,4 m 2` → 12.65 / 12.65 / 8.4; null without an area. */
export function parseAreaM2(text: string): number | null {
  const match = AREA_PATTERN.exec(text);
  if (!match?.[1]) return null;
  // Areas are decimals: without a comma, a dot is an (English) decimal point, so "12.65 m2" is 12,65 m².
  const value = parseBelgianNumber(match[1], { dotIsDecimal: !match[1].includes(",") });
  return value !== null && value > 0 && value < 100_000 ? value : null;
}

/** "KEUKEN" → "Keuken"; mixed case stays as it is. */
export function tidyLabelName(text: string): string {
  const name = text
    .replace(/[\s:–—-]+$/u, "")
    .replace(/^[\s:–—-]+/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) {
    const lower = name.toLocaleLowerCase("nl-BE");
    return lower.charAt(0).toLocaleUpperCase("nl-BE") + lower.slice(1);
  }
  return name;
}

/** A room name: at least two letters, not mostly digits (dimensions, levels, scale notes). */
function looksLikeName(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  if (letters < 2 || digits > letters) return false;
  // Scale notes and level marks are not rooms.
  return !/^(schaal|scale|peil|niveau|\+|-)\b/i.test(text.trim()) && !/1\s*\/\s*\d{2,3}/.test(text);
}

type Line = { items: PlanTextItem[]; text: string; x: number; y: number; width: number; height: number };

const centreY = (item: { y: number; height: number }) => item.y + item.height / 2;

/** Joins items that sit on one line (allowing a raised "2" after "m") into lines of text. */
function groupLines(items: readonly PlanTextItem[]): Line[] {
  const sorted = items
    .filter((item) => item.str.trim() !== "" && item.height > 0)
    .sort((a, b) => centreY(a) - centreY(b) || a.x - b.x);
  const lines: { items: PlanTextItem[] }[] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) =>
      candidate.items.some((other) => {
        const height = Math.max(other.height, item.height);
        // Horizontal gap between the two (negative when they overlap).
        const gap = Math.max(other.x, item.x) - Math.min(other.x + other.width, item.x + item.width);
        return Math.abs(centreY(other) - centreY(item)) < height * 0.6 && gap < height * 1.2;
      }),
    );
    if (line) line.items.push(item);
    else lines.push({ items: [item] });
  }
  return lines.map(({ items: parts }) => {
    parts.sort((a, b) => a.x - b.x);
    let text = "";
    parts.forEach((part, index) => {
      const previous = parts[index - 1];
      const gap = previous ? part.x - (previous.x + previous.width) : 0;
      text += previous && gap > Math.min(previous.height, part.height) * 0.15 ? ` ${part.str.trim()}` : part.str.trim();
    });
    const x = Math.min(...parts.map((part) => part.x));
    const y = Math.min(...parts.map((part) => part.y));
    const right = Math.max(...parts.map((part) => part.x + part.width));
    const bottom = Math.max(...parts.map((part) => part.y + part.height));
    return { items: parts, text: text.trim(), x, y, width: right - x, height: bottom - y };
  });
}

const centre = (line: Line) => ({ u: line.x + line.width / 2, v: line.y + line.height / 2 });

/**
 * Finds room labels: a line with an area, named by the text on the same line or by a name line just
 * above (or below) it. Lines without an area are never labels on their own: plans are full of text.
 */
export function parsePlanLabels(items: readonly PlanTextItem[]): DetectedLabel[] {
  const lines = groupLines(items);
  const used = new Set<Line>();
  const labels: DetectedLabel[] = [];

  for (const line of lines) {
    const match = AREA_PATTERN.exec(line.text);
    const areaM2 = parseAreaM2(line.text);
    if (!match || areaM2 === null) continue;
    used.add(line);
    const before = tidyLabelName(line.text.slice(0, match.index));
    if (looksLikeName(before)) {
      labels.push({ name: before, areaM2, ...centre(line) });
      continue;
    }
    // The nearest free name line above (preferred) or below, roughly centred over the area.
    const own = centre(line);
    let best: { line: Line; score: number } | null = null;
    for (const candidate of lines) {
      if (used.has(candidate) || parseAreaM2(candidate.text) !== null || !looksLikeName(candidate.text)) continue;
      const other = centre(candidate);
      const dy = other.v - own.v;
      const reach = Math.max(line.height, candidate.height) * 3;
      if (Math.abs(dy) > reach || dy === 0) continue;
      const dx = Math.abs(other.u - own.u);
      if (dx > Math.max(line.width, candidate.width) * 0.75 + line.height) continue;
      const score = Math.abs(dy) * (dy < 0 ? 1 : 1.5) + dx;
      if (!best || score < best.score) best = { line: candidate, score };
    }
    if (best) {
      used.add(best.line);
      const other = centre(best.line);
      labels.push({ name: tidyLabelName(best.line.text), areaM2, u: (own.u + other.u) / 2, v: (own.v + other.v) / 2 });
    } else {
      labels.push({ name: "", areaM2, ...own });
    }
  }
  return labels.slice(0, 300);
}
