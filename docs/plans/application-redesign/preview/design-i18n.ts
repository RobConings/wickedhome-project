import i18n from "i18next";
import copy from "./design-copy.json";
/** Design-only bilingual copy; production continues to use per-feature locale namespaces. */
export function tr(text: string | undefined): string {
  if (!text) return "";
  return i18n.resolvedLanguage === "nl"
    ? ((copy as Record<string, string>)[text] ?? text)
    : text;
}
export function localize<T extends { label: string; description?: string }>(
  items: T[],
): T[] {
  return items.map((item) => ({
    ...item,
    label: tr(item.label),
    ...(item.description ? { description: tr(item.description) } : {}),
  }));
}
