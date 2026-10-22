/**
 * Fuzzy text matching shared by intent routing (skills.ts / routing.ts) and the entity resolvers
 * (resolve.ts): case- and accent-insensitive, Dutch and English plurals folded away, small typos forgiven.
 * Pure and dependency-free, so it is cheap to run on every message.
 */

/** "Één Kéuken " → "een keuken": lower case, no accents, single spaces. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words of a text (letters and digits), folded. */
export function words(value: string): string[] {
  return fold(value)
    .split(/[^\p{L}\p{N}']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/**
 * A crude stem good enough for keyword matching in Dutch and English: plural endings off (-'s, -en, -es,
 * -s), then a final -e, doubled vowels and a doubled last consonant folded. "taken" and "taak" → "tak"; "boodschappen" and
 * "boodschap" → "bodschap"; "bills" → "bil"… The same function runs on both sides, so it only has to be
 * consistent, not linguistically right.
 */
export function stem(word: string): string {
  let value = fold(word).replace(/'s$/, "");
  if (value.length > 4 && value.endsWith("en")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) value = value.slice(0, -1);
  // A final -e too, so "klusje" meets "klusjes" (→ klusj) and "chore" meets "chores" (→ chor).
  if (value.length > 3 && value.endsWith("e")) value = value.slice(0, -1);
  value = value.replace(/([aeiou])\1+/g, "$1");
  value = value.replace(/([^aeiou])\1$/, "$1");
  return value;
}

export const stems = (value: string) => words(value).map(stem);

/** Levenshtein distance, stopping early above `max` (returns max + 1). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      current.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length] ?? max + 1;
}

/** Two words are "close": equal stems, or a small typo in a longer word. */
export function closeWords(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return true;
  const longest = Math.max(a.length, b.length);
  if (longest < 4) return false;
  return editDistance(a, b, longest >= 7 ? 2 : 1) <= (longest >= 7 ? 2 : 1);
}

/**
 * How well a query names a candidate name, 0–100:
 * 100 equal · 85 first word or leading part equal ("Clara" → "Clara Peeters") · 70 every query word starts a
 * name word · 60 the name contains the query · 55 the query contains the name ("the kitchen" → "Kitchen") ·
 * 50 every query word has an equal stem in the name · 45 every query word is a close typo · 0 otherwise.
 */
export function nameScore(query: string, name: string): number {
  const q = fold(query);
  const n = fold(name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  const qWords = words(q);
  const nWords = words(n);
  if (!qWords.length || !nWords.length) return 0;
  if (n.startsWith(`${q} `) || (qWords.length === 1 && nWords[0] === qWords[0])) return 85;
  if (qWords.every((word) => nWords.some((candidate) => candidate.startsWith(word)))) return 70;
  if (q.length >= 3 && n.includes(q)) return 60;
  if (n.length >= 3 && new RegExp(`(^|\\s)${escapeRegex(n)}(\\s|$)`).test(q)) return 55;
  const nStems = nWords.map(stem);
  if (qWords.every((word) => nStems.includes(stem(word)))) return 50;
  if (qWords.every((word) => nWords.some((candidate) => closeWords(word, candidate)))) return 45;
  return 0;
}

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const BELGIAN_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/;

/**
 * A date inside a query ("Vuilnis buiten 2026-10-05", "tandarts 7/10"), and the query without it. A day
 * without year takes `year`. The resolvers use it to tell apart tasks or events with the same title.
 */
export function splitDate(query: string, year: number): { text: string; date: string | null } {
  const iso = ISO_DATE.exec(query);
  if (iso) return { text: query.replace(iso[0], " ").replace(/\s+/g, " ").trim(), date: iso[0] };
  const be = BELGIAN_DATE.exec(query);
  if (be) {
    const [, day = "", month = "", fullYear] = be;
    const d = Number(day);
    const m = Number(month);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const date = `${fullYear ?? year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { text: query.replace(be[0], " ").replace(/\s+/g, " ").trim(), date };
    }
  }
  return { text: query.trim(), date: null };
}
