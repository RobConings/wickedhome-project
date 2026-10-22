import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import { z } from "zod";
import { LOCALES, type Locale } from "@/types/common";
import { intlLocale } from "./format";

/**
 * Translations live next to the code that uses them:
 *   src/locales/<lang>.json                     → namespace "common" (ui, shared, layout, app frame)
 *   src/features/<feature>/locales/<lang>.json  → namespace "<feature>"
 * They are discovered at build time, so adding a feature never means editing this file.
 */
const files = import.meta.glob<{ default: Record<string, unknown> }>("../**/locales/*.json", { eager: true });

const resources: Resource = {};
for (const [path, module] of Object.entries(files)) {
  const match = path.match(/(?:features\/([^/]+)\/)?locales\/([a-z]{2})\.json$/);
  if (!match) continue;
  const [, feature, lang] = match;
  if (!lang) continue;
  (resources[lang] ??= {})[feature ?? "common"] = module.default;
}

const STORAGE_KEY = "wh-locale";

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    // Storage unavailable; fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en";
}

function applyLocale(locale: Locale) {
  // nl-BE / en-BE: browsers that honour `lang` then show native date inputs as dd/mm/yyyy.
  document.documentElement.lang = intlLocale(locale);
  z.config(locale === "nl" ? z.locales.nl() : z.locales.en());
}

export function initI18n() {
  const locale = detectLocale();
  applyLocale(locale);
  return i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: "en",
    supportedLngs: LOCALES,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export async function setLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not persisted on this device; the account setting still is.
  }
  applyLocale(locale);
  await i18n.changeLanguage(locale);
}

export const currentLocale = (): Locale => (i18n.resolvedLanguage === "nl" ? "nl" : "en");
