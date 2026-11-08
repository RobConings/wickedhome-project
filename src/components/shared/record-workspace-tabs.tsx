import type * as React from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Shared record navigation, not a generic record renderer: every feature supplies its own
 * details and relationships. The URL keeps the selected section, originating record and filters.
 */
export function RecordWorkspaceTabs({
  details,
  overview,
  detailsLabel,
  overviewLabel,
  label,
  className,
}: {
  details: React.ReactNode;
  overview: React.ReactNode;
  detailsLabel: string;
  overviewLabel: string;
  label: string;
  className?: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("workspace") === "overview" ? "overview" : "details";
  function select(value: string) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === "overview") next.set("workspace", "overview");
        else next.delete("workspace");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return (
    <Tabs value={section} onValueChange={select} className={cn("min-w-0", className)}>
      <TabsList aria-label={label} className="grid h-auto min-h-12 w-full grid-cols-2 items-stretch rounded-xl bg-muted/60 p-1">
        <TabsTrigger value="details" className="h-auto min-h-11 min-w-0 whitespace-normal px-2 py-2 leading-tight">{detailsLabel}</TabsTrigger>
        <TabsTrigger value="overview" className="h-auto min-h-11 min-w-0 whitespace-normal px-2 py-2 leading-tight">{overviewLabel}</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="min-w-0">{details}</TabsContent>
      <TabsContent value="overview" className="min-w-0">{overview}</TabsContent>
    </Tabs>
  );
}
