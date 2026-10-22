import { ASSISTANT_SPEECH_MAX } from "../types/assistant";
import { normalizeForSpeech, type SpeechLocale } from "./speech-normalize";

/**
 * Turning an answer into spoken chunks for the server voice (ai/docs/ASSISTANT.md "Speech output"): markdown
 * symbols out, then sentences, short ones kept together, so the first chunk can play while the next is made.
 *
 * Works while the answer is still streaming in (`SpeechChunker`): only text up to a safe boundary is handed
 * out (a finished sentence, or for the first chunk a comma or colon with text after it); the tail stays
 * buffered, so an amount ("€ 1.234,56"), a date or an abbreviation ("bv.") is never cut in half. Fed in
 * pieces, it gives exactly the chunks it gives for the whole text at once.
 */

/** Markdown-ish answer text without the symbols a voice would read out. */
export const speakable = (text: string) => text.replace(/[*_#`>]/g, "").replace(/\s*\n+\s*-\s*/g, ". ").trim();

/**
 * Words ending in a dot that don't end a sentence (Dutch and English). Without the final dot; lower case.
 * `enz` and `etc` do end a sentence when a capital follows.
 */
const ABBREVIATIONS = new Set([
  "bv", "bijv", "o.a", "nr", "nrs", "enz", "etc", "e.d", "d.w.z", "m.a.w", "ca", "incl", "excl", "tel", "blz",
  "pag", "st", "dr", "mr", "mrs", "ms", "mevr", "dhr", "vs", "e.g", "i.e", "approx", "fig", "resp", "evt",
  "t.a.v", "i.p.v", "a.u.b", "s.v.p", "vgl", "zgn", "jan", "feb", "mrt", "apr", "jun", "jul", "aug", "sep",
  "sept", "okt", "oct", "nov", "dec",
]);
const MAY_END = new Set(["enz", "etc"]);

/** Sentence ends within one line of text. */
function sentencesOf(line: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  // Punctuation (and closing quotes or brackets) followed by a space or the end; "€ 1.234,56" and "12.30" never match.
  const ends = /[.!?…]+["'”’)\]]*(?=\s|$)/g;
  for (let match = ends.exec(line); match; match = ends.exec(line)) {
    const end = match.index + match[0].length;
    const rest = line.slice(end).trimStart();
    if (rest && match[0].startsWith(".") && !match[0].startsWith("...")) {
      const word = /(\S+)$/.exec(line.slice(start, match.index))?.[1]?.replace(/^["'“‘(]+/, "") ?? "";
      const lower = word.toLowerCase();
      const next = rest[0] ?? "";
      const capitalNext = next !== next.toLowerCase();
      if (ABBREVIATIONS.has(lower) && !(MAY_END.has(lower) && capitalNext)) continue;
      // Initials ("J. Peeters") and a list number at the start ("1. Melk").
      if (/^\p{Lu}$/u.test(word)) continue;
      if (/^\d+$/.test(word) && line.slice(start, match.index).trim() === word) continue;
      // A lower-case word after the dot: an abbreviation we don't know, not a new sentence.
      if (/^\p{Ll}/u.test(next)) continue;
    }
    const sentence = line.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
  }
  const tail = line.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/** A sentence longer than `limit` split at clause marks (, ; : –), else between words, else hard. */
function splitLong(sentence: string, limit: number): string[] {
  if (sentence.length <= limit) return [sentence];
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    let cut = -1;
    for (const match of window.matchAll(/[,;:–—](?=\s)/g)) if (match.index >= limit / 3) cut = match.index + 1;
    if (cut < 0) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = limit;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces.filter(Boolean);
}

export type SplitOptions = {
  /** The first chunk stays this short (spoken length: after normalising, in `speechChunks`), so the voice starts quickly. */
  first?: number;
  /** The first chunk ends at the first sentence end, comma or colon after at least this many characters. */
  firstMin?: number;
  /** Later chunks are filled up to about this many characters. */
  target?: number;
  /** A sentence longer than this is split at its commas. */
  long?: number;
  /** After the first chunk, shorter than this ("Oké.") always goes together with the next sentence. */
  min?: number;
  /** Never more than this per chunk (the server's limit). */
  max?: number;
};

/** How far into the answer (characters of text) a place for the end of the first chunk is looked for. */
const FIRST_WINDOW = 160;

/** The sentences of the text so far; the first `stable` won't change any more, whatever text still follows. */
type Units = { units: string[]; stable: number };

/** A markdown link still being written at the end of a streaming answer: wait for it (its text is spoken, not its URL). */
function withoutOpenLink(text: string): string {
  const open = text.lastIndexOf("[");
  if (open < text.lastIndexOf("\n") + 1) return text;
  return /^\[[^\]\n]*(?:\](?:\([^)\n]*)?)?$/.test(text.slice(open)) ? text.slice(0, open) : text;
}

/**
 * The sentences a voice reads: links, markdown and bullets removed; every line ends a sentence (a list item
 * without a full stop gets one, so the voice pauses). `open`: more text may follow, so the last line's last
 * sentence may still grow (or turn out not to end where it seems to: "bv.", "€ 1.").
 */
function sentenceUnits(text: string, open: boolean): Units {
  const lines = (open ? withoutOpenLink(text) : text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // List items on one line ("rekening: * Mozenno: € 223,72 * Dela: …") each become a line; "3 * 2" is "3 × 2".
    .replace(/(\S)[ \t]+[*•][ \t]+(?=(\S))/g, (_match, before: string, after: string) => (/\d/.test(before) && /\d/.test(after) ? `${before} × ` : `${before}\n`))
    .split(/\r?\n/);
  const units: string[] = [];
  let stable = 0;
  lines.forEach((raw, index) => {
    let line = speakable(raw.replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, "")).replace(/\s+/g, " ").trim();
    if (!/[\p{L}\p{N}]/u.test(line)) return;
    const openLine = open && index === lines.length - 1;
    if (!openLine && !/[.!?…:;]["'”’)\]]*$/.test(line)) line = `${line}.`;
    units.push(...sentencesOf(line));
    stable = openLine ? units.length - 1 : units.length;
  });
  return { units, stable };
}

type Cut = { unit: number; offset: number; text: string; kind: "sentence" | "clause" | "word"; joint?: boolean };

/** Words a phrase starts with: cutting a sentence between two words sounds most natural right before one. */
const JOINTS = new Set([
  "en", "of", "maar", "want", "dus", "omdat", "voor", "met", "om", "in", "op", "aan", "bij", "naar", "van", "tot", "door",
  "over", "die", "dat", "als", "wanneer", "terwijl", "and", "or", "but", "because", "so", "for", "with", "to", "on", "at",
  "by", "from", "of", "that", "which", "when", "while", "if",
]);

/**
 * The first chunk: up to the first sentence end, comma or colon after `firstMin` characters, at most `first`
 * (as `measure` counts). When that place comes too late, the longest piece that fits, preferring punctuation
 * over a cut between two words (best before "en", "voor", "with"…; never next to a number). Null while that
 * can't be decided yet.
 */
function firstChunk({ units, stable }: Units, ended: boolean, first: number, firstMin: number, limit: number, measure: (text: string) => number): Cut | null {
  if (units.length === 0) return null;
  const cuts: Cut[] = [];
  let before = "";
  let tooFar = false;
  scan: for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!;
    const places: { offset: number; kind: Cut["kind"]; joint?: boolean }[] = [];
    for (const match of unit.matchAll(/[,;:–—](?=\s)/g)) {
      // "3, 4 en 5 oktober", "10 – 12 uur": a list or range of numbers stays together.
      if (/\d\s*$/.test(unit.slice(0, match.index)) && /^\s*\d/.test(unit.slice(match.index + 1))) continue;
      places.push({ offset: match.index + 1, kind: "clause" });
    }
    for (const match of unit.matchAll(/(?<=\p{L}) (?=(\p{L}+)\P{L})/gu)) {
      // Before the first of such words ("| voor in totaal", not "voor | in totaal").
      const previous = /(\p{L}+)$/u.exec(unit.slice(0, match.index))?.[1]?.toLowerCase() ?? "";
      places.push({ offset: match.index, kind: "word", joint: JOINTS.has(match[1]!.toLowerCase()) && !JOINTS.has(previous) });
    }
    if (index < stable) places.push({ offset: unit.length, kind: "sentence" });
    places.sort((a, b) => a.offset - b.offset);
    for (const place of places) {
      const text = `${before} ${unit.slice(0, place.offset)}`.trim();
      if (text.length > FIRST_WINDOW) {
        tooFar = true;
        break scan;
      }
      const cut: Cut = { unit: index, offset: place.offset, text, kind: place.kind, joint: place.joint };
      cuts.push(cut);
      if (place.kind !== "word" && measure(text) >= firstMin) {
        if (measure(text) <= first) return cut;
        tooFar = true;
        break scan;
      }
    }
    // The open sentence: nothing is known after it yet.
    if (index >= stable) break;
    before = `${before} ${unit}`.trim();
  }
  if (!tooFar && !ended && units.join(" ").length <= FIRST_WINDOW) return null;

  const fits = cuts.filter((cut) => measure(cut.text) <= first);
  const pick =
    fits.findLast((cut) => cut.kind !== "word" && measure(cut.text) >= firstMin / 2) ??
    fits.findLast((cut) => cut.kind === "word" && cut.joint && measure(cut.text) >= firstMin) ??
    fits.findLast((cut) => cut.kind === "word") ??
    fits.findLast((cut) => cut.kind !== "word");
  if (pick) return pick;
  // Nowhere to cut: the first sentence (its first piece when very long), once it is complete.
  if (stable === 0) return null;
  const piece = splitLong(units[0]!, limit)[0]!;
  return { unit: 0, offset: piece.length, text: piece, kind: "sentence" };
}

export type ChunkerOptions = SplitOptions & {
  /** With a locale: chunks come out normalised to spoken words (`speech-normalize.ts`), the first measured that way. */
  locale?: SpeechLocale;
  /** `YYYY-MM-DD`: decides whether a date's year is spoken. */
  today?: string;
};

/**
 * Spoken chunks of an answer that streams in. `push` each piece of text and play what it returns; `end` when
 * the answer is complete hands out the rest. Same chunks as for the whole text at once.
 */
export class SpeechChunker {
  private text = "";
  private ended = false;
  /** Where the text after the first chunk starts (sentence and offset in it), once the first chunk is out. */
  private rest: { unit: number; offset: number } | null = null;
  /** Later chunks handed out. */
  private sent = 0;
  private readonly measured = new Map<string, number>();
  private readonly options: Required<SplitOptions> & Pick<ChunkerOptions, "locale" | "today">;

  constructor(options: ChunkerOptions = {}) {
    this.options = { first: 60, firstMin: 20, target: 260, long: 300, min: 40, max: ASSISTANT_SPEECH_MAX, ...options };
  }

  /** Adds streamed text; returns the chunks that are complete now. */
  push(piece: string): string[] {
    if (this.ended || !piece) return [];
    this.text += piece;
    return this.take();
  }

  /** The answer is complete: returns the remaining chunks. */
  end(): string[] {
    if (this.ended) return [];
    this.ended = true;
    return this.take();
  }

  private measure = (text: string): number => {
    const { locale, today } = this.options;
    if (!locale) return text.length;
    let length = this.measured.get(text);
    if (length === undefined) {
      length = normalizeForSpeech(text, locale, today ?? "").length;
      this.measured.set(text, length);
    }
    return length;
  };

  private spoken(chunk: string): string[] {
    const { locale, today, max } = this.options;
    if (!locale) return [chunk];
    return splitLong(normalizeForSpeech(chunk, locale, today ?? ""), max).filter((piece) => /[\p{L}\p{N}]/u.test(piece));
  }

  private take(): string[] {
    const { first, firstMin, target, long, min, max } = this.options;
    const limit = Math.min(long, max);
    const found = sentenceUnits(this.text, !this.ended);
    const out: string[] = [];
    if (!this.rest) {
      const cut = firstChunk(found, this.ended, first, firstMin, limit, this.measure);
      if (!cut) return out;
      this.rest = { unit: cut.unit, offset: cut.offset };
      out.push(...this.spoken(cut.text));
    }

    // Later chunks: sentences filled up to `target` (a very short one always joins the next); a chunk is
    // complete once the sentence after it is known (or the answer ended).
    const { units, stable } = found;
    const pieces: { text: string; stable: boolean }[] = [];
    units.forEach((unit, index) => {
      if (index < this.rest!.unit) return;
      const text = index === this.rest!.unit ? unit.slice(this.rest!.offset).trim() : unit;
      if (text) for (const piece of splitLong(text, limit)) pieces.push({ text: piece, stable: index < stable });
    });
    const chunks: string[] = [];
    let current = "";
    let open = false;
    for (const piece of pieces) {
      const joined = current ? `${current} ${piece.text}` : piece.text;
      if (!current || (joined.length <= max && (current.length < min || joined.length <= target))) current = joined;
      else if (!piece.stable) {
        open = true;
        break;
      } else {
        chunks.push(current);
        current = piece.text;
      }
    }
    if (this.ended && !open && current) chunks.push(current);
    for (const chunk of chunks.slice(this.sent)) out.push(...this.spoken(chunk));
    this.sent = Math.max(this.sent, chunks.length);
    return out;
  }
}

/** The answer as chunks (not normalised): one sentence or a few short ones each, the first one short. */
export function splitSentences(text: string, options: SplitOptions = {}): string[] {
  const chunker = new SpeechChunker(options);
  return [...chunker.push(text), ...chunker.end()];
}

/**
 * What the voices (Piper and the browser's) actually read: the chunks of `splitSentences`, each normalised to
 * spoken words ("€ 223,72" → "tweehonderddrieëntwintig euro tweeënzeventig", `speech-normalize.ts`). Splitting
 * comes first so amounts and abbreviations don't end a sentence; words are longer than digits, so a chunk that
 * grew past the server's limit is split again. `today` (`YYYY-MM-DD`) decides whether a date's year is spoken.
 */
export function speechChunks(text: string, locale: SpeechLocale, today: string, options: SplitOptions = {}): string[] {
  const chunker = new SpeechChunker({ ...options, locale, today });
  return [...chunker.push(text), ...chunker.end()];
}
