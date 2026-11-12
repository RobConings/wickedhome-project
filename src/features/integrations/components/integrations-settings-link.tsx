import { Text } from "@/components/ui/text";
import { Link } from "react-router";
import { ArrowRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/card";

/** The Settings section pointing to the Integrations page (connections live there, not in Settings). */
export function IntegrationsSettingsLink() {
  const { t } = useTranslation("integrations");
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Text size="sm" tone="muted">{t("settingsLink.text")}</Text>
      <Button asChild variant="outline" className="w-fit">
        <Link to="/integrations">
          {t("settingsLink.open")}
          <ArrowRightIcon />
        </Link>
      </Button>
    </Card>
  );
}
