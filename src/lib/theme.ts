import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "wh-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

let preference = readPreference();

const resolve = (): ResolvedTheme => (preference === "system" ? (media.matches ? "dark" : "light") : preference);

function apply() {
  document.documentElement.classList.toggle("dark", resolve() === "dark");
  listeners.forEach((listener) => listener());
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage unavailable (private mode); the choice lasts for this visit.
  }
  apply();
}

/** Call once at startup, before the first render, to avoid a flash of the wrong theme. */
export function initTheme() {
  media.addEventListener("change", apply);
  apply();
}

let snapshot = { preference, resolved: resolve() };
function getSnapshot() {
  if (snapshot.preference !== preference || snapshot.resolved !== resolve()) {
    snapshot = { preference, resolved: resolve() };
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
