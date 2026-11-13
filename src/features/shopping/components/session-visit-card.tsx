import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { ArrowUpRightIcon, ShoppingCartIcon } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shared/card";
import { ShopLogo, type Shop } from "@/features/shops";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { sessionDisplayName, type SessionSummary } from "../types/sessions";

/** A real, fully clickable workspace entry, with the actual shops and their saved logos. */
export function SessionVisitCard({ visit, shops, to, statusLabel, metadata, actionLabel }: { visit: SessionSummary; shops: Shop[]; to?: string; statusLabel?: string; metadata?: string; actionLabel?: string }) {
  const { t } = useTranslation("shopping");
  const active = visit.status === "active";
  const visitShops = visit.shopIds.flatMap((id) => shops.find((shop) => shop.id === id) ?? []);
  return (
    <Link
      to={to ?? `/shopping/sessions/${encodeURIComponent(visit.id)}`}
      aria-label={t("sessions.openSession", { name: visit.name })}
      className="group block min-w-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-section/50"
    >
      <Card tone={active ? "featured" : "default"} className="h-full gap-3 p-4 transition-[border-color,box-shadow,transform] group-hover:border-section group-hover:shadow-md group-active:translate-y-px sm:p-5">
        <Inline gap="md" align="start" className="min-w-0">
          <Inline gap="none" align="center" className="min-w-0 shrink-0 -space-x-2">
            {visitShops.length ? visitShops.slice(0, 3).map((shop) => (
              <ShopLogo key={shop.id} shop={shop} size="md" className="ring-2 ring-card" />
            )) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
                <ShoppingCartIcon className="size-5" aria-hidden="true" />
              </span>
            )}
            {visitShops.length > 3 && (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold ring-2 ring-card">
                +{visitShops.length - 3}
              </span>
            )}
          </Inline>
          <div className="min-w-0 flex-1">
            <Inline gap="sm" align="center" wrap>
              <h3 className="min-w-0 break-words font-semibold leading-snug group-hover:text-section">{sessionDisplayName(visit.name, visit.startedAt)}</h3>
              <Badge variant={active ? "success" : "neutral"}>{statusLabel ?? t(`sessions.${visit.status}`)}</Badge>
            </Inline>
            <Text size="xs" tone="muted" className="mt-1">
              {metadata ?? formatDate(visit.startedAt, currentLocale())}
              {visitShops.length > 0 && <> · {visitShops.map((shop) => shop.name).join(" · ")}</>}
            </Text>
          </div>
          <ArrowUpRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-section" aria-hidden="true" />
        </Inline>
        <Inline gap="none" align="center" justify="end" className="text-sm font-medium text-section">
          {actionLabel ?? t(active ? "sessions.continue" : "sessions.viewSession")}
        </Inline>
      </Card>
    </Link>
  );
}
