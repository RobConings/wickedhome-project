/** An origin is navigation context, never authorisation or proof of the source record's data. */
export function internalOrigin(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || Array.from(value).some((character) => character.charCodeAt(0) < 32)) return null;
  try { const url = new URL(value, "https://wickedhome.invalid"); return url.origin === "https://wickedhome.invalid" ? `${url.pathname}${url.search}${url.hash}` : null; } catch { return null; }
}

export function withRecordOrigin(destination: string, origin: string): string {
  const safeOrigin = internalOrigin(origin);
  if (!safeOrigin || !destination.startsWith("/") || destination.startsWith("//")) return destination;
  const target = new URL(destination, "https://wickedhome.invalid");
  if (target.searchParams.has("from")) return destination;
  const source = new URL(safeOrigin, "https://wickedhome.invalid");
  if (target.pathname === source.pathname) return destination;
  target.searchParams.set("from", safeOrigin);
  return `${target.pathname}${target.search}${target.hash}`;
}
