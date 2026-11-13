import { ArrowLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, type To } from "react-router";
import { Button } from "@/components/ui/button";
import { internalOrigin } from "@/lib/record-navigation";

/** The single Back slot in every page header: exact record context, explicit parent, then app history. */
export function PageBackButton({ to, fallback = "/" }: { to?: To; fallback?: To }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const origin = internalOrigin(new URLSearchParams(location.search).get("from"));
  const safeOrigin = origin === `${location.pathname}${location.search}${location.hash}` ? null : origin;
  const destination = safeOrigin ?? to;
  const content = <ArrowLeftIcon aria-hidden="true" />;
  // Keep the visual control compact; the accessible name stays on the link/button.
  const className = "page-back-button shrink-0";
  if (destination) return <Button asChild variant="outline" size="icon" className={className} data-slot="page-back">
    <Link to={destination} aria-label={safeOrigin ? t("navigation.returnToContext") : t("actions.back")}>{content}</Link>
  </Button>;
  const hasHistory = typeof window !== "undefined" && Number(window.history.state?.idx) > 0;
  const atHome = location.pathname === "/" && !location.search;
  return <Button variant="outline" size="icon" className={className} aria-label={t("actions.back")} data-slot="page-back" disabled={!hasHistory && atHome} onClick={() => hasHistory ? navigate(-1) : navigate(fallback)}>{content}</Button>;
}
