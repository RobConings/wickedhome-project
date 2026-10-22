import { ArrowRightIcon, BellRingIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardFooter } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { cn } from "@/lib/utils";
import { addDays } from "@/types/dates";
import { wasteTiming, type WasteSummary } from "../types/waste";
import { useWasteDayLabel } from "./waste-day-label";
import { WasteDayList } from "./waste-day-list";
import { WasteCollectionChip } from "./waste-fraction-icon";
import { IconCardHeader } from "@/components/shared/icon-card-header";

type WasteCardProps = {
  /** `null` when the request failed. */
  summary: WasteSummary | null;
  /** Today, `YYYY-MM-DD` in the household time zone. */
  today: string;
};

function Header() {
  const { t } = useTranslation("waste");
  return (
    <IconCardHeader icon={Trash2Icon} tone="success" title={t("card.title")} />
  );
}

/**
 * The next collections. The day before a collection it stands out ("Tomorrow: PMD + Paper — put it out
 * tonight"); on the day itself it says it's today.
 */
export function WasteCard({ summary, today }: WasteCardProps) {
  const { t } = useTranslation("waste");
  const label = useWasteDayLabel(today);

  if (!summary) {
    return (
      <Card>
        <Header />
        <InlineAlert tone="error">{t("card.loadError")}</InlineAlert>
      </Card>
    );
  }

  if (!summary.setup) {
    return (
      <Card>
        <Header />
        <p className="text-sm text-muted-foreground">{t("card.notSetUp")}</p>
        <CardFooter>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to="/settings#waste">
              {t("card.setUp")}
              <ArrowRightIcon />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const [next, ...later] = summary.upcoming;
  const timing = next ? wasteTiming(next.date, today, addDays(today, 1)) : null;
  const labels = next?.collections.map((collection) => collection.label).join(", ") ?? "";

  return (
    <Card>
      <Header />
      {summary.setup.lastSyncStatus === "error" && !next && <InlineAlert tone="error">{t("card.syncError")}</InlineAlert>}
      {!next ? (
        <p className="text-sm text-muted-foreground">{t("card.none")}</p>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-lg border p-3",
            timing === "tomorrow" && "border-highlight bg-highlight/60 text-highlight-foreground",
            timing === "today" && "bg-accent",
          )}
          role={timing === "tomorrow" ? "status" : undefined}
        >
          <div className="flex items-start gap-2">
            {timing === "tomorrow" && <BellRingIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <p className="text-sm font-semibold">
              {timing === "tomorrow"
                ? t("card.tomorrow", { labels })
                : timing === "today"
                  ? t("card.today", { labels })
                  : t("card.next", { date: label(next.date), labels })}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {next.collections.map((collection) => (
              <WasteCollectionChip key={`${collection.fraction}-${collection.label}`} collection={collection} className="bg-background" />
            ))}
          </div>
        </div>
      )}
      {later.length > 0 && <WasteDayList days={later} today={today} className="-my-2" />}
      <CardFooter>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to="/calendar">
            {t("card.calendar")}
            <ArrowRightIcon />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

/** The card's shape while it loads. */
export function WasteCardSkeleton() {
  const { t } = useTranslation("waste");
  return (
    <Card aria-busy="true">
      <Header />
      <span className="sr-only" role="status">
        {t("card.loading")}
      </span>
      <Skeleton aria-hidden className="h-20 w-full rounded-lg" />
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    </Card>
  );
}
