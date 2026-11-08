import { createContext, createElement, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Presentation supplied by the composition root. No domain fetching or ownership in shared UI. */
type PageIdentity = { icon: LucideIcon; section: { to: string; label: string }; isSectionRoot: boolean };
const Identity = createContext<PageIdentity | null>(null);
export function PageIdentityProvider({ value, children }: { value: PageIdentity | null; children: ReactNode }) {
  return createElement(Identity.Provider, { value }, children);
}
export const usePageIdentity = () => useContext(Identity);
