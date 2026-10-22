import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { ScrollRow } from "@/components/layout/scroll-row";
import { cn } from "@/lib/utils";

const PAGES = [
  { to: "/energy", key: "overview", end: true },
  { to: "/energy/appliances", key: "appliances", end: false },
  { to: "/energy/setup", key: "setup", end: false },
  { to: "/energy/import", key: "import", end: false },
] as const;

/** Links between the energy pages, styled like tabs. */
export function EnergyNav({ className }: { className?: string }) {
  const { t } = useTranslation("energy");
  return (
    // One pill row that scrolls inside itself on narrow phones (the links are focusable), never the page.
    <nav aria-label={t("nav.label")} className={cn("min-w-0", className)}>
      <ScrollRow gap="xs" focusable={false} className="inline-flex h-9 w-fit gap-0 rounded-lg bg-muted p-[3px] text-muted-foreground">
        {PAGES.map((page) => (
          <NavLink
            key={page.key}
            to={page.to}
            end={page.end}
            className={({ isActive }) =>
              cn(
                "inline-flex h-full items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                isActive ? "bg-background text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground",
              )
            }
          >
            {t(`nav.${page.key}`)}
          </NavLink>
        ))}
      </ScrollRow>
    </nav>
  );
}
