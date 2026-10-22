/**
 * The spoken form of an answer chunk for the read-aloud voices (Piper on the server and the browser's own
 * voice): amounts, dates, times, numbers, units, codes, symbols and abbreviations written out as words, in
 * Dutch (Flemish) or English, so "€ 223,72" is read "tweehonderddrieëntwintig euro tweeënzeventig" and
 * "05/10/2026" "vijf oktober" (ai/docs/ASSISTANT.md "Speech output").
 *
 * Runs per chunk after the sentence splitter (which still sees "1.234,56" and "bv."). Pure and dependency-free;
 * every rule passes text it doesn't recognise through unchanged and the whole never throws.
 */

export type SpeechLocale = "nl" | "en";

type Context = { lang: SpeechLocale; year: number };

// ── Numbers ──────────────────────────────────────────────────────────────────────────────────────────

const NL_SMALL = ["nul", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien", "elf", "twaalf", "dertien", "veertien", "vijftien", "zestien", "zeventien", "achttien", "negentien"];
const NL_TENS = ["", "tien", "twintig", "dertig", "veertig", "vijftig", "zestig", "zeventig", "tachtig", "negentig"];
const EN_SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "ten", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Larger numbers are read digit by digit. */
const MAX_WORDS = 999_999_999_999;

function nlBelow100(n: number): string {
  if (n < 20) return NL_SMALL[n] ?? "";
  const tens = NL_TENS[Math.floor(n / 10)] ?? "";
  const unit = n % 10;
  if (!unit) return tens;
  const word = NL_SMALL[unit] ?? "";
  // "tweeëntwintig", "drieëntwintig": a trema where two e's would meet.
  return `${word}${word.endsWith("e") ? "ën" : "en"}${tens}`;
}

function nlBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 0 ? "" : hundreds === 1 ? "honderd" : `${NL_SMALL[hundreds]}honderd`;
  return rest || !head ? head + nlBelow100(rest) : head;
}

function enBelow100(n: number): string {
  if (n < 20) return EN_SMALL[n] ?? "";
  const tens = EN_TENS[Math.floor(n / 10)] ?? "";
  const unit = n % 10;
  return unit ? `${tens}-${EN_SMALL[unit]}` : tens;
}

function enBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${EN_SMALL[hundreds]} hundred`);
  if (rest || !hundreds) parts.push(enBelow100(rest));
  return parts.join(" ");
}

function groupsOf(n: number) {
  return { billions: Math.floor(n / 1e9), millions: Math.floor(n / 1e6) % 1000, thousands: Math.floor(n / 1000) % 1000, rest: n % 1000 };
}

/** Dutch: one word up to duizend, a space after duizend, miljoen and miljard ("tweeduizend driehonderdvijftig"). */
function nlCardinal(n: number): string {
  if (n === 0) return "nul";
  const { billions, millions, thousands, rest } = groupsOf(n);
  const words: string[] = [];
  if (billions) words.push(`${nlBelow1000(billions)} miljard`);
  if (millions) words.push(`${nlBelow1000(millions)} miljoen`);
  if (thousands) words.push(thousands === 1 ? "duizend" : `${nlBelow1000(thousands)}duizend`);
  if (rest) words.push(nlBelow1000(rest));
  return words.join(" ");
}

/** English without "and": "two hundred twenty-three", "one thousand one". */
function enCardinal(n: number): string {
  if (n === 0) return "zero";
  const { billions, millions, thousands, rest } = groupsOf(n);
  const words: string[] = [];
  if (billions) words.push(`${enBelow1000(billions)} billion`);
  if (millions) words.push(`${enBelow1000(millions)} million`);
  if (thousands) words.push(`${enBelow1000(thousands)} thousand`);
  if (rest) words.push(enBelow1000(rest));
  return words.join(" ");
}

/** Digit by digit: "één twee drie" / "one two three". */
function spellDigits(digits: string, lang: SpeechLocale): string {
  return [...digits].map((digit) => (digit === "1" && lang === "nl" ? "één" : (lang === "nl" ? NL_SMALL : EN_SMALL)[Number(digit)] ?? digit)).join(" ");
}

/**
 * A whole number in words. On its own, Dutch 1 is "één" (a count, never the article "een"); inside a longer
 * number it stays "een" ("eenentwintig", "honderdeen").
 */
export function numberToWords(n: number, lang: SpeechLocale, standalone = true): string {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_WORDS) return spellDigits(String(n).replace(/\D/g, ""), lang);
  if (lang === "nl") return n === 1 && standalone ? "één" : nlCardinal(n);
  return enCardinal(n);
}

const EN_ORDINAL: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };

function enOrdinal(n: number): string {
  const words = enCardinal(n);
  const match = /^(.*?)([a-z]+)$/.exec(words);
  if (!match) return `${words}th`;
  const [, head = "", last = ""] = match;
  const ordinal = EN_ORDINAL[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return head + ordinal;
}

function nlOrdinal(n: number): string {
  if (n === 1) return "eerste";
  if (n === 3) return "derde";
  if (n === 8) return "achtste";
  if (n < 20) return `${nlCardinal(n)}de`;
  const rest = n % 100;
  if (n >= 100 && rest > 0 && rest < 20) {
    const head = nlCardinal(n - rest);
    return `${head}${(n - rest) % 1000 === 0 ? " " : ""}${nlOrdinal(rest)}`;
  }
  return `${nlCardinal(n)}ste`;
}

const ordinal = (n: number, lang: SpeechLocale) => (lang === "nl" ? nlOrdinal(n) : enOrdinal(n));

/** A year as people say it: "tweeduizend zesentwintig", "negentienhonderdnegentig"; "twenty twenty-seven". */
function yearToWords(year: number, lang: SpeechLocale): string {
  if (lang === "nl") {
    if (year >= 1100 && year < 2000) return `${nlBelow100(Math.floor(year / 100))}honderd${year % 100 ? nlBelow100(year % 100) : ""}`;
    return numberToWords(year, lang, false);
  }
  if (year >= 2000 && year < 2010) return year === 2000 ? "two thousand" : `two thousand ${enBelow100(year % 100)}`;
  if (year >= 1000 && year < 2100) {
    const high = enBelow100(Math.floor(year / 100));
    const low = year % 100;
    if (low === 0) return `${high} hundred`;
    return low < 10 ? `${high} oh ${enBelow100(low)}` : `${high} ${enBelow100(low)}`;
  }
  return numberToWords(year, lang, false);
}

type ParsedNumber = { digits: string; value: number; fraction: string | null; grouped: boolean };

/**
 * A written number: Belgian "1.234,56" and "3,2", English "1,234.56" and "3.5". A single dot followed by three
 * digits groups thousands ("12.500"); a single comma followed by three digits does so only in English.
 */
function parseNumber(raw: string, lang: SpeechLocale): ParsedNumber | null {
  const dots = raw.split(".").length - 1;
  const commas = raw.split(",").length - 1;
  let decimal: "." | "," | null = null;
  if (dots && commas) decimal = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ",";
  else if (dots + commas === 1) {
    const separator = dots ? "." : ",";
    const after = raw.length - raw.indexOf(separator) - 1;
    decimal = after === 3 && (separator === "." || lang === "en") ? null : separator;
  }
  let whole = raw;
  let fraction: string | null = null;
  if (decimal) {
    const index = raw.lastIndexOf(decimal);
    whole = raw.slice(0, index);
    fraction = raw.slice(index + 1);
  }
  const groupSeparator = decimal === "." ? "," : decimal === "," ? "." : dots ? "." : ",";
  const groups = whole.split(groupSeparator);
  if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0] ?? "") || groups.slice(1).some((group) => !/^\d{3}$/.test(group)))) return null;
  const digits = groups.join("");
  if (!/^\d+$/.test(digits) || (fraction !== null && !/^\d+$/.test(fraction))) return null;
  return { digits, value: Number(digits), fraction, grouped: groups.length > 1 };
}

/** Digits in small groups, separated by a pause: "één twee drie, vier vijf zes". */
function spellGroups(groups: string[], lang: SpeechLocale): string {
  return groups
    .filter(Boolean)
    .map((group) => [...group].map((char) => (/\d/.test(char) ? spellDigits(char, lang) : char.toUpperCase())).join(" "))
    .join(", ");
}

const chunked = (digits: string, size = 3) => digits.match(new RegExp(`.{1,${size}}`, "g")) ?? [digits];

/** A parsed number in words; long digit strings and leading zeros (codes) digit by digit. */
function parsedToWords(number: ParsedNumber, lang: SpeechLocale): string {
  const { digits, value, fraction, grouped } = number;
  if (!grouped && digits.length > 1 && digits.startsWith("0") && fraction === null) return spellGroups(chunked(digits), lang);
  if ((!grouped && digits.length >= 7) || value > MAX_WORDS) return spellGroups(chunked(digits), lang);
  const whole = numberToWords(value, lang);
  if (fraction === null) return whole;
  if (lang === "en") return `${whole} point ${spellDigits(fraction, lang)}`;
  const decimals = fraction.length <= 2 && !fraction.startsWith("0") ? numberToWords(Number(fraction), lang) : spellDigits(fraction, lang);
  return `${whole} komma ${decimals}`;
}

// ── Vocabulary ──────────────────────────────────────────────────────────────────────────────────────

const NL_MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mrt: 3, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, oct: 10, nov: 11, dec: 12,
};
NL_MONTHS.forEach((month, index) => (MONTH_INDEX[month] = index + 1));
EN_MONTHS.forEach((month, index) => (MONTH_INDEX[month.toLowerCase()] = index + 1));
const byLength = (words: string[]) => [...words].sort((a, b) => b.length - a.length);
const MONTH_SRC = byLength(Object.keys(MONTH_INDEX)).join("|");

const NL_WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const EN_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_INDEX: Record<string, number> = {
  ma: 0, di: 1, wo: 2, do: 3, vr: 4, za: 5, zo: 6, mon: 0, tue: 1, tues: 1, wed: 2, thu: 3, thur: 3, thurs: 3, fri: 4, sat: 5, sun: 6,
};
NL_WEEKDAYS.forEach((day, index) => (WEEKDAY_INDEX[day] = index));
EN_WEEKDAYS.forEach((day, index) => (WEEKDAY_INDEX[day.toLowerCase()] = index));
const WEEKDAY_SRC = byLength(Object.keys(WEEKDAY_INDEX)).join("|");

type UnitWords = { nl: [string, string]; en: [string, string] };
const unit = (nl: string | [string, string], en: [string, string]): UnitWords => ({ nl: typeof nl === "string" ? [nl, nl] : nl, en });
const KWH = unit("kilowattuur", ["kilowatt hour", "kilowatt hours"]);
const SQUARE = unit("vierkante meter", ["square metre", "square metres"]);
const CUBIC = unit("kubieke meter", ["cubic metre", "cubic metres"]);
const DEGREES = unit(["graad", "graden"], ["degree", "degrees"]);
const HOURS = unit("uur", ["hour", "hours"]);
const SPEED = unit("kilometer per uur", ["kilometre per hour", "kilometres per hour"]);
/** Units written after a number (singular, plural). */
const UNITS: Record<string, UnitWords> = {
  "km/h": SPEED,
  "km/u": SPEED,
  kWh: KWH,
  KWh: KWH,
  kwh: KWH,
  MWh: unit("megawattuur", ["megawatt hour", "megawatt hours"]),
  Wh: unit("wattuur", ["watt hour", "watt hours"]),
  kW: unit("kilowatt", ["kilowatt", "kilowatts"]),
  W: unit("watt", ["watt", "watts"]),
  "m²": SQUARE,
  m2: SQUARE,
  "m³": CUBIC,
  m3: CUBIC,
  cm: unit("centimeter", ["centimetre", "centimetres"]),
  mm: unit("millimeter", ["millimetre", "millimetres"]),
  km: unit("kilometer", ["kilometre", "kilometres"]),
  m: unit("meter", ["metre", "metres"]),
  kg: unit("kilo", ["kilo", "kilos"]),
  g: unit("gram", ["gram", "grams"]),
  ml: unit("milliliter", ["millilitre", "millilitres"]),
  cl: unit("centiliter", ["centilitre", "centilitres"]),
  l: unit("liter", ["litre", "litres"]),
  "°C": DEGREES,
  "° C": DEGREES,
  "°": DEGREES,
  "%": unit("procent", ["percent", "percent"]),
  min: unit(["minuut", "minuten"], ["minute", "minutes"]),
  sec: unit(["seconde", "seconden"], ["second", "seconds"]),
  u: HOURS,
  h: HOURS,
};
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const UNIT_SRC = byLength(Object.keys(UNITS)).map(escapeRegex).join("|");
const unitWords = (token: string, lang: SpeechLocale, one: boolean) => UNITS[token]?.[lang][one ? 0 : 1] ?? token;

// ── Patterns ─────────────────────────────────────────────────────────────────────────────────────────

const NUMBER_SRC = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?`;
const AMOUNT_SRC = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const DATE_SRC = String.raw`\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\/\d{1,2}(?:\/\d{4})?`;
const TIME_SRC = String.raw`(?:[01]?\d|2[0-3]):[0-5]\d(?!\d)`;
const WEEKDAY_PREFIX = String.raw`(?:(?<![\p{L}])(${WEEKDAY_SRC})\.?,?\s+)?`;
const RELATIVE_DAYS = "vandaag|morgen|overmorgen|gisteren|eergisteren|vanavond|vanmiddag|vanochtend|vannacht|today|tomorrow|yesterday|tonight";
const SIGN = "[-−]";

/** Words before a range that already say "from" / "between". */
function rangeWords(before: string, lang: SpeechLocale): { from: string; to: string } {
  const nl = lang === "nl";
  if (/(?:^|[^\p{L}])(?:tussen|between)\s+$/iu.test(before)) return { from: "", to: nl ? " en " : " and " };
  if (/(?:^|[^\p{L}])(?:van|vanaf|from)\s+$/iu.test(before)) return { from: "", to: nl ? " tot " : " to " };
  return { from: nl ? "van " : "from ", to: nl ? " tot " : " to " };
}

type DateParts = { day: number; month: number; year: number | null };

function parseDate(token: string): DateParts | null {
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  let day: number, month: number, year: number | null;
  if (match) [day, month, year] = [Number(match[3]), Number(match[2]), Number(match[1])];
  else if ((match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(token))) [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(token))) {
    // Without a year only the app's own "05/10", so "1/2" stays a fraction.
    if (!match[3] && !/^\d{2}\/\d{2}$/.test(token)) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : null];
  } else return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
}

function weekdayWords(written: string | undefined, lang: SpeechLocale): string {
  if (!written) return "";
  const index = WEEKDAY_INDEX[written.toLowerCase()];
  if (index === undefined) return written;
  if (lang === "en") return EN_WEEKDAYS[index] ?? written;
  const name = NL_WEEKDAYS[index] ?? written;
  return /^\p{Lu}/u.test(written) ? name[0]!.toUpperCase() + name.slice(1) : name;
}

const yearSuffix = (year: number | null, ctx: Context) => (year !== null && year !== ctx.year ? ` ${yearToWords(year, ctx.lang)}` : "");
const dayWords = (day: number, ctx: Context) => (ctx.lang === "nl" ? numberToWords(day, "nl") : `the ${enOrdinal(day)}`);
const monthName = (month: number, ctx: Context) => (ctx.lang === "nl" ? NL_MONTHS : EN_MONTHS)[month - 1] ?? "";

/** "vijf oktober" / "the fifth of October", the year only when it isn't this year. */
function dateWords({ day, month, year }: DateParts, ctx: Context, weekday = ""): string {
  const date = ctx.lang === "nl" ? `${dayWords(day, ctx)} ${monthName(month, ctx)}` : `${dayWords(day, ctx)} of ${monthName(month, ctx)}`;
  return `${weekday ? `${weekday} ` : ""}${date}${yearSuffix(year, ctx)}`;
}

function timeWords(hour: number, minute: number, lang: SpeechLocale): string {
  if (lang === "nl") {
    if (hour === 0 && minute === 0) return "middernacht";
    return `${numberToWords(hour, "nl")} uur${minute ? ` ${numberToWords(minute, "nl")}` : ""}`;
  }
  if (hour === 0 && minute === 0) return "midnight";
  if (minute === 0) return hour <= 12 ? `${enCardinal(hour)} o'clock` : `${enCardinal(hour)} hundred`;
  return `${enCardinal(hour)} ${minute < 10 ? `oh ${enCardinal(minute)}` : enCardinal(minute)}`;
}

function moneyWords(raw: string, negative: boolean, lang: SpeechLocale): string | null {
  const number = parseNumber(raw, lang);
  if (!number || number.value > MAX_WORDS) return null;
  let euros = number.value;
  let cents = 0;
  if (number.fraction) {
    cents = Number(`${number.fraction}00`.slice(0, 2));
    if (Number(number.fraction[2] ?? "0") >= 5) cents += 1;
    if (cents === 100) [euros, cents] = [euros + 1, 0];
  }
  let words: string;
  if (lang === "nl") words = euros === 0 && cents > 0 ? `${numberToWords(cents, "nl")} cent` : `${numberToWords(euros, "nl")} euro${cents ? ` ${numberToWords(cents, "nl")}` : ""}`;
  else if (euros === 0 && cents > 0) words = `${enCardinal(cents)} ${cents === 1 ? "cent" : "cents"}`;
  else words = `${enCardinal(euros)} ${euros === 1 ? "euro" : "euros"}${cents ? ` ${enCardinal(cents)}` : ""}`;
  return negative && (euros || cents) ? `${lang === "nl" ? "min" : "minus"} ${words}` : words;
}

// ── Abbreviations ────────────────────────────────────────────────────────────────────────────────────

type Abbreviation = [written: string, spoken: string, mayEnd?: boolean];
const ABBREVIATIONS: Record<SpeechLocale, Abbreviation[]> = {
  nl: [
    ["bijv.", "bijvoorbeeld"], ["bv.", "bijvoorbeeld"], ["o.a.", "onder andere"], ["nrs.", "nummers"], ["nr.", "nummer"],
    ["ca.", "ongeveer"], ["ong.", "ongeveer"], ["incl.", "inclusief"], ["excl.", "exclusief"], ["enz.", "enzovoort", true],
    ["e.d.", "en dergelijke", true], ["d.w.z.", "dat wil zeggen"], ["m.a.w.", "met andere woorden"], ["i.p.v.", "in plaats van"],
    ["evt.", "eventueel"], ["t.a.v.", "ter attentie van"], ["a.u.b.", "alstublieft", true], ["s.v.p.", "alstublieft", true],
    ["tel.", "telefoon"], ["blz.", "bladzijde"], ["vgl.", "vergelijk"], ["zgn.", "zogenaamd"], ["resp.", "respectievelijk"],
    ["max.", "maximaal"], ["dhr.", "meneer"], ["mevr.", "mevrouw"], ["m.b.t.", "met betrekking tot"], ["o.b.v.", "op basis van"],
    ["t.e.m.", "tot en met"], ["t/m", "tot en met"], ["vs.", "versus"],
  ],
  en: [
    ["e.g.", "for example"], ["i.e.", "that is"], ["etc.", "et cetera", true], ["approx.", "approximately"], ["ca.", "approximately"],
    ["incl.", "including"], ["excl.", "excluding"], ["vs.", "versus"], ["nos.", "numbers"], ["no.", "number"], ["max.", "maximum"],
  ],
};

// ── Passes ───────────────────────────────────────────────────────────────────────────────────────────

type Pass = (text: string, ctx: Context) => string;

/** Markdown, links, URLs and emoji: nothing a voice should read. */
const cleanup: Pass = (text, ctx) => {
  const link = ctx.lang === "nl" ? "de link" : "the link";
  let out = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(?:https?:\/\/|www\.)[^\s<>()]+?(?=[.,;:!?]?(?:\s|$|\)))/giu, link)
    .replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}|[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\*\*|__|~~|`+/g, "")
    .replace(/(^|\n)\s*#+\s*/g, "$1")
    .replace(/(^|\n)\s*>\s*/g, "$1")
    .replace(/#(?=\d)/g, ctx.lang === "nl" ? "nummer " : "number ")
    .replace(/#/g, "");
  if (out.includes("\n")) {
    out = out
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, "").trim())
      .filter((line) => /[\p{L}\p{N}]/u.test(line))
      .map((line) => (/[.!?…:;,]["'”’)\]]*$/.test(line) ? line : `${line}.`))
      .join(" ");
  }
  // Bullets on one line ("rekening: * Mozenno: € 223,72 * Dela: …") become pauses; "3 * 2 m" is "3 × 2 m".
  out = out.replace(/(\S)\s+[*•]\s+(?=(\S))/gu, (_match, before: string, after: string) => {
    if (/\d/.test(before) && /\d/.test(after)) return `${before} × `;
    return /[.!?:;,]/.test(before) ? `${before} ` : `${before}. `;
  });
  return out.replace(/(^|\s)[*•]\s+/g, "$1").replace(/\*/g, "");
};

const abbreviations: Pass = (text, ctx) =>
  ABBREVIATIONS[ctx.lang].reduce((out, [written, spoken, mayEnd]) => {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}.])${escapeRegex(written)}${written.endsWith(".") ? "" : "(?![\\p{L}])"}${written === "no." ? "(?=\\s?\\d)" : ""}`, "giu");
    return out.replace(pattern, (match: string, offset: number, whole: string) => {
      const rest = whole.slice(offset + match.length);
      const word = /^\p{Lu}/u.test(match) ? spoken[0]!.toUpperCase() + spoken.slice(1) : spoken;
      const ends = written.endsWith(".") && (!rest.trim() || (mayEnd === true && /^\s+\p{Lu}/u.test(rest)));
      return ends ? `${word}.` : word;
    });
  }, text);

/** Belgian structured communication "+++123/4567/89012+++": the digits in their groups, no markers. */
const structured: Pass = (text, ctx) =>
  text.replace(/(?:\+{3}|\*{3})?\s?(?<![\d/])(\d{3})\/(\d{4})\/(\d{5})(?![\d/])\s?(?:\+{3}|\*{3})?/g, (_m, a: string, b: string, c: string) => ` ${spellGroups([a, b, c], ctx.lang)} `);

/** IBAN "BE12 3456 7890 1234": letters and digits one by one, in their groups. */
const iban: Pass = (text, ctx) =>
  text.replace(/(?<![\p{L}\p{N}])([A-Z]{2}\d{2})((?: ?[A-Z0-9]{4}){2,7})( ?[A-Z0-9]{1,3})?(?![\p{L}\p{N}])/gu, (match: string) => {
    const compact = match.replace(/ /g, "");
    return spellGroups(compact.match(/.{1,4}/g) ?? [compact], ctx.lang);
  });

/** "morgen (05/10/2026)": the date adds nothing when spoken. */
const relativeDates: Pass = (text) =>
  text.replace(new RegExp(String.raw`(?<![\p{L}])(${RELATIVE_DAYS})\s*\(\s*${WEEKDAY_PREFIX}(?:${DATE_SRC})(?:,?\s+(?:om\s+|at\s+)?${TIME_SRC})?\s*\)`, "giu"), "$1");

/** "05/10/2026 14:30" → "… om 14:30" (not before a time range, which says "van … tot"). */
const dateAtTime: Pass = (text, ctx) =>
  text.replace(new RegExp(String.raw`(?<![\d\/.,-])(${DATE_SRC})\s+(?=${TIME_SRC}(?!\s?[–—-]\s?\d))`, "gu"), (match: string, token: string) =>
    parseDate(token) ? `${token} ${ctx.lang === "nl" ? "om" : "at"} ` : match,
  );

const dateRanges: Pass = (text, ctx) =>
  text.replace(
    new RegExp(String.raw`(?<![\d\/.,-])${WEEKDAY_PREFIX}(${DATE_SRC})\s?[–—-]\s?${WEEKDAY_PREFIX}(${DATE_SRC})(?![\d\/])`, "giu"),
    (match: string, w1: string | undefined, t1: string, w2: string | undefined, t2: string, offset: number, whole: string) => {
      const first = parseDate(t1);
      const second = parseDate(t2);
      if (!first || !second) return match;
      const year = second.year ?? first.year;
      const firstYear = first.year ?? year;
      const { from, to } = rangeWords(whole.slice(0, offset), ctx.lang);
      if (first.month === second.month && firstYear === year && !w1 && !w2) {
        const days = `${from}${dayWords(first.day, ctx)}${to}${dayWords(second.day, ctx)}`;
        return `${days}${ctx.lang === "nl" ? " " : " of "}${monthName(second.month, ctx)}${yearSuffix(year, ctx)}`;
      }
      const start = dateWords({ ...first, year: firstYear === year ? null : firstYear }, ctx, weekdayWords(w1, ctx.lang));
      return `${from}${start}${to}${dateWords({ ...second, year }, ctx, weekdayWords(w2, ctx.lang))}`;
    },
  );

const dates: Pass = (text, ctx) => {
  let out = text.replace(
    new RegExp(String.raw`(?<![\d\/.,-])${WEEKDAY_PREFIX}(${DATE_SRC})(?![\d\/])`, "giu"),
    (match: string, weekday: string | undefined, token: string) => {
      const date = parseDate(token);
      return date ? dateWords(date, ctx, weekdayWords(weekday, ctx.lang)) : match;
    },
  );
  // "5 okt.", "5 oktober 2026", "5th October", "October 5th, 2027".
  out = out.replace(
    new RegExp(String.raw`(?<![\p{L}\p{N}])(\d{1,2})(?:e|ste|de|st|nd|rd|th)?\s+(${MONTH_SRC})\.?(?:\s+(\d{4}))?(?![\p{L}\p{N}])`, "giu"),
    (match: string, day: string, month: string, year: string | undefined) => {
      const index = MONTH_INDEX[month.toLowerCase()];
      if (!index || Number(day) < 1 || Number(day) > 31) return match;
      return dateWords({ day: Number(day), month: index, year: year ? Number(year) : null }, ctx);
    },
  );
  return out.replace(
    new RegExp(String.raw`(?<![\p{L}])(${byLength(EN_MONTHS).join("|")})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?![\p{L}\p{N}])`, "gu"),
    (match: string, month: string, day: string, year: string | undefined) => {
      const index = MONTH_INDEX[month.toLowerCase()];
      if (!index || Number(day) < 1 || Number(day) > 31) return match;
      return dateWords({ day: Number(day), month: index, year: year ? Number(year) : null }, ctx);
    },
  );
};

const HOUR_SUFFIX = String.raw`(?:\s?(?:uur|u|h)(?![\p{L}\p{N}]))?`;

const timeRanges: Pass = (text, ctx) =>
  text.replace(
    new RegExp(String.raw`(?<![\d:.,\/])([01]?\d|2[0-3]):([0-5]\d)\s?[–—-]\s?([01]?\d|2[0-3]):([0-5]\d)(?![\d:])${HOUR_SUFFIX}`, "gu"),
    (_m, h1: string, m1: string, h2: string, m2: string, offset: number, whole: string) => {
      const [a, b, c, d] = [Number(h1), Number(m1), Number(h2), Number(m2)];
      const { from, to } = rangeWords(whole.slice(0, offset), ctx.lang);
      if (ctx.lang === "en" && b === 0 && d === 0 && a >= 1 && a <= 12 && c >= 1 && c <= 12) return `${from}${enCardinal(a)}${to}${enCardinal(c)} o'clock`;
      return `${from}${timeWords(a, b, ctx.lang)}${to}${timeWords(c, d, ctx.lang)}`;
    },
  );

const times: Pass = (text, ctx) =>
  text
    .replace(new RegExp(String.raw`(?<![\d:.,\/])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])${HOUR_SUFFIX}`, "gu"), (_m, h: string, m: string) => timeWords(Number(h), Number(m), ctx.lang))
    .replace(/(?<![\d.,])([01]?\d|2[0-3])\.([0-5]\d)\s?(?:uur|u)(?![\p{L}])/gu, (_m, h: string, m: string) => timeWords(Number(h), Number(m), ctx.lang))
    // Belgian "14u30", "9u".
    .replace(/(?<![\p{L}\p{N}])([01]?\d|2[0-3])u([0-5]\d)?(?![\p{L}\p{N}])/gu, (_m, h: string, m: string | undefined) => timeWords(Number(h), Number(m ?? 0), ctx.lang));

/** Phone numbers "0470 12 34 56", "+32 9 123 45 67": digit by digit in their groups. */
const phones: Pass = (text, ctx) =>
  text.replace(/(?<![\p{L}\p{N}+])(\+\d{2,3}|0)((?:[ ./-]?\d){8,11})(?![\p{L}\p{N}])/gu, (match: string) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 13) return match;
    const plus = match.startsWith("+") ? "plus " : "";
    const groups = match.replace(/^\+/, "").split(/[ ./-]/);
    return plus + spellGroups(groups.length > 1 ? groups : chunked(digits), ctx.lang);
  });

const money: Pass = (text, ctx) => {
  const to = (before: string) => rangeWords(before, ctx.lang);
  return text
    .replace(
      new RegExp(String.raw`(?<![\p{L}\p{N}])(?:€|EUR(?![\p{L}]))\s?(${AMOUNT_SRC})\s?[–—-]\s?(?:€\s?)?(${AMOUNT_SRC})(?![.,]?\d)`, "gu"),
      (match: string, a: string, b: string, offset: number, whole: string) => {
        const first = moneyWords(a, false, ctx.lang);
        const second = moneyWords(b, false, ctx.lang);
        if (!first || !second) return match;
        const words = to(whole.slice(0, offset));
        return `${words.from}${first}${words.to}${second}`;
      },
    )
    .replace(
      new RegExp(String.raw`(?<![\p{L}\p{N}])(${SIGN}\s?)?(?:€|EUR(?![\p{L}]))\s?(${SIGN}\s?)?(${AMOUNT_SRC})(?:,[-–])?(?![.,]?\d)`, "gu"),
      (match: string, sign1: string | undefined, sign2: string | undefined, amount: string) => moneyWords(amount, Boolean(sign1 || sign2), ctx.lang) ?? match,
    )
    .replace(
      new RegExp(String.raw`(?<![\p{L}\p{N}.,])(${SIGN})?(${AMOUNT_SRC})(?:,[-–])?\s?(?:€|EUR(?![\p{L}])|euros?(?![\p{L}]))`, "gu"),
      (match: string, sign: string | undefined, amount: string) => moneyWords(amount, Boolean(sign), ctx.lang) ?? match,
    );
};

/** "1e", "2de", "3rd": ordinals. */
const ordinals: Pass = (text, ctx) =>
  text.replace(/(?<![\p{L}\p{N}.,])(\d{1,4})(?:ste|de|e|st|nd|rd|th)(?![\p{L}\p{N}])/gu, (match: string, n: string) => (Number(n) > 0 ? ordinal(Number(n), ctx.lang) : match));

/** "3 x 2,8 m" → "3 op 2,8 m"; "3x per week" → "3 keer per week". */
const multiply: Pass = (text, ctx) =>
  text
    .replace(/(\d(?:\s?(?:cm|mm|km|m))?)\s?[x×]\s?(?=[-−]?\d)/gu, `$1 ${ctx.lang === "nl" ? "op" : "by"} `)
    .replace(/(?<![\p{L}\p{N}.,])(\d+)\s?[x×](?![\p{L}\p{N}])/gu, `$1 ${ctx.lang === "nl" ? "keer" : "times"}`);

/** "24/7", "3/5" (not a date, that went earlier) → "24 op 7" / "3 out of 5". */
const slashNumbers: Pass = (text, ctx) =>
  text.replace(/(?<![\p{L}\p{N}.,/])(\d+)\s?\/\s?(\d+)(?![\p{L}\p{N}/])/gu, (_m, a: string, b: string) =>
    ctx.lang === "nl" ? `${a} op ${b}` : a === "24" && b === "7" ? "24 7" : `${a} out of ${b}`,
  );

/** "2–3 dagen", "10-15%" → "2 tot 3 dagen". */
const numberRanges: Pass = (text, ctx) =>
  text.replace(
    new RegExp(String.raw`(?<![\p{L}\p{N}.,\/:])(${NUMBER_SRC})(\s?(?:${UNIT_SRC}))?(?:\s?[–—]\s?|-|\s-\s)(?=${SIGN}?\d)`, "gu"),
    (_m, n: string, u: string | undefined) => `${n}${u ?? ""}${ctx.lang === "nl" ? " tot " : " to "}`,
  );

/** Words after which a four-digit number is a year ("in 2027", "oktober 2026"). */
const YEAR_CONTEXT = new RegExp(String.raw`(?:^|[^\p{L}])(?:in|sinds|vanaf|van|tot|voor|na|jaar|tegen|begin|eind|einde|since|from|until|till|before|after|year|of|end|early|late|${MONTH_SRC})\.?\s+$`, "iu");

const numbers: Pass = (text, ctx) =>
  text.replace(
    new RegExp(String.raw`(?<![\p{L}\p{N}.,])([-−+](?=\d))?(${NUMBER_SRC})(?![.,]?\d)(?:\s?(${UNIT_SRC})(?![\p{L}\p{N}]))?`, "gu"),
    (match: string, sign: string | undefined, raw: string, unitToken: string | undefined, offset: number, whole: string) => {
      const next = whole[offset + match.length] ?? "";
      if (!unitToken && /\p{L}/u.test(next)) return match;
      const number = parseNumber(raw, ctx.lang);
      if (!number) return match;
      const signWord = sign === "+" ? "plus " : sign ? (ctx.lang === "nl" ? "min " : "minus ") : "";
      const isYear = !unitToken && !sign && !number.grouped && number.fraction === null && /^\d{4}$/.test(number.digits) && number.value >= 1100 && number.value < 2100 && YEAR_CONTEXT.test(whole.slice(0, offset));
      const words = isYear ? yearToWords(number.value, ctx.lang) : parsedToWords(number, ctx.lang);
      if (!unitToken) return `${signWord}${words}`;
      const one = number.fraction === null && number.value === 1;
      return `${signWord}${words} ${unitWords(unitToken, ctx.lang, one)}`;
    },
  );

const PER_WORDS = "maand|jaar|dag|week|stuk|persoon|month|year|day|piece|person";

/** "/kWh" after an amount, "en/of", "&", "+", dashes between words. */
const symbols: Pass = (text, ctx) => {
  const nl = ctx.lang === "nl";
  return text
    .replace(new RegExp(String.raw`\s?\/\s?(${UNIT_SRC}|${PER_WORDS})(?![\p{L}\p{N}])`, "gu"), (_m, token: string) => ` per ${UNITS[token] ? unitWords(token, ctx.lang, true) : token}`)
    .replace(/(?<![\p{L}])en\/of(?![\p{L}])/giu, "en of")
    .replace(/(?<![\p{L}])and\/or(?![\p{L}])/giu, "and or")
    .replace(/(?<=\p{L})\s?\/\s?(?=\p{L})/gu, nl ? " of " : " or ")
    .replace(/\s*&\s*/g, nl ? " en " : " and ")
    .replace(/\s*\+\s*/g, " plus ")
    .replace(/\s+[–—-]\s+/g, ", ")
    .replace(/€/g, " euro ")
    .replace(/%/g, nl ? " procent " : " percent ")
    .replace(/[×]/g, nl ? " keer " : " times ");
};

const tidy: Pass = (text) =>
  text
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/,(?:\s*,)+/g, ",")
    .replace(/([,;:])\s*\.(?!\.)/g, ".")
    .replace(/\.\s+\.(?!\.)/g, ".")
    .trim();

const PASSES: Pass[] = [
  cleanup,
  abbreviations,
  structured,
  iban,
  relativeDates,
  dateAtTime,
  dateRanges,
  dates,
  timeRanges,
  times,
  phones,
  money,
  ordinals,
  multiply,
  slashNumbers,
  numberRanges,
  numbers,
  symbols,
  tidy,
];

/**
 * `text` as a voice should read it, in `locale`. `today` (`YYYY-MM-DD`, the household's day) decides whether a
 * date's year is spoken. A rule that fails is skipped; the text never gets lost.
 */
export function normalizeForSpeech(text: string, locale: SpeechLocale, today: string): string {
  if (typeof text !== "string" || !text) return typeof text === "string" ? text : "";
  const ctx: Context = { lang: locale === "en" ? "en" : "nl", year: Number(/^(\d{4})-/.exec(today ?? "")?.[1] ?? Number.NaN) };
  return PASSES.reduce((out, pass) => {
    try {
      return pass(out, ctx);
    } catch {
      return out;
    }
  }, text);
}
