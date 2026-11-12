/** Conservative promotion math: only single-product thresholds explicitly printed on the page. */
export function promotionPrice(priceCents: number | null, quantity: number, text: string | null) {
  const base = { estimatedTotalCents: priceCents === null ? null : priceCents * quantity, promotionApplied: false, promotionNote: text };
  if (priceCents === null || !text || /combineer|servicekost|bon|coupon|xtra|online only| · /i.test(text)) return base;
  const percent = text.match(/^\s*-(\d{1,2})%\s+(?:vanaf|bij aankoop van)\s+(\d+)\s*st/i);
  if (percent && quantity >= Number(percent[2])) return { ...base, estimatedTotalCents: Math.round(priceCents * quantity * (100 - Number(percent[1])) / 100), promotionApplied: true };
  const fixed = text.match(/^\s*€\s*(\d+),(\d{2})\s*\/st\s+vanaf\s+(\d+)\s*st/i);
  if (fixed && quantity >= Number(fixed[3])) return { ...base, estimatedTotalCents: (Number(fixed[1]) * 100 + Number(fixed[2])) * quantity, promotionApplied: true };
  const free = text.match(/^\s*(\d+)\s*\+\s*(\d+)\s*(?:gratis)?\s*$/i);
  if (free) { const paid = Number(free[1]), bonus = Number(free[2]), pack = paid + bonus; if (paid > 0 && bonus > 0) return { ...base, estimatedTotalCents: (Math.floor(quantity / pack) * paid + quantity % pack) * priceCents, promotionApplied: quantity >= pack }; }
  return base;
}
const tokens = (name: string) => new Set(name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z0-9]+/g) ?? []);
/** Ranking only, never an automatic substitution or dietary-equivalence claim. */
export function productMatch(query: string, product: string) {
  const wanted = tokens(query), candidate = tokens(product);
  if (!wanted.size) return 0;
  const missingRestriction = [...wanted].some((word) => /^(bio|lactosevrij|glutenvrij|vegan|suikervrij)$/.test(word) && !candidate.has(word));
  if (missingRestriction) return 0;
  return Math.round([...wanted].filter((word) => candidate.has(word)).length / wanted.size * 100);
}
export function euroCents(text: string | null): number | null {
  const value = text?.match(/(?:€\s*|Prijs:\s*€\s*)(\d+(?:[.\s]\d{3})*),(\d{2})/i);
  return value ? Number(value[1]!.replace(/[.\s]/g, "")) * 100 + Number(value[2]) : null;
}
