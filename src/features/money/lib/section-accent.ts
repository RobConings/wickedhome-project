/**
 * Section accents (docs/BRANDING.md): one hue per area of the app. Setting `data-accent="<name>"` on an
 * element points the `--section*` CSS tokens (src/styles/index.css) at that hue for everything inside it.
 * The app frame sets it per page from the route (src/app/section-accents.ts); features never pick one.
 */
export const SECTION_ACCENTS = [
  "home",
  "tasks",
  "shopping",
  "calendar",
  "energy",
  "finance",
  "documents",
  "devices",
  "assistant",
  "integrations",
] as const;

export type SectionAccent = (typeof SECTION_ACCENTS)[number];

export function isSectionAccent(value: unknown): value is SectionAccent {
  return typeof value === "string" && (SECTION_ACCENTS as readonly string[]).includes(value);
}
