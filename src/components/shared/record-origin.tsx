import { ArrowLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { internalOrigin } from "@/lib/record-navigation";

/** One predictable return to the exact originating filters and record. */
export function RecordOrigin() {
  const location = useLocation();
  const { t } = useTranslation();
  const origin = internalOrigin(new URLSearchParams(location.search).get("from"));
  if (!origin || origin === `${location.pathname}${location.search}${location.hash}`) return null;
  return <nav aria-label={t("navigation.context")} className="rounded-xl border border-section-border bg-section-soft p-2 text-section-foreground">
    <Link to={origin} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeftIcon className="size-4" aria-hidden="true" />{t("navigation.returnToContext")}</Link>
  </nav>;
}
