import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Inline } from "@/components/layout/inline";
import type { ShoppingAssignment } from "../types/shopping-assignments";
/** Links sit outside row buttons: annotations never toggle a purchase or nest interactive controls. */
export function ShoppingAssignmentBadges({ assignments }: { assignments: readonly ShoppingAssignment[] }) {
  const { t, i18n } = useTranslation("shopping");
  return <Inline gap="xs" wrap aria-label={t("assignments.label")}>
    {assignments.map(assignment => <Badge key={`${assignment.kind}:${assignment.id}`} variant={assignment.kind === "reservation" ? "info" : "secondary"} asChild className="max-w-full whitespace-normal text-left">
      <Link className="min-h-8 py-1" to={assignment.href} title={[t("assignments.presenceOnly"), assignment.kind === "reservation" && `#${assignment.id}`, assignment.pickupFrom && new Date(assignment.pickupFrom).toLocaleString(i18n.language, { timeZone: "Europe/Brussels" })].filter(Boolean).join(" · ")}>
        {t(`assignments.${assignment.kind}`, { name: assignment.name })}
      </Link>
    </Badge>)}
  </Inline>;
}
