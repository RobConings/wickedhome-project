import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/shared/page-header";

/**
 * `/integrations`: one card per integration (Google, Home Assistant, the assistant…). The cards come from
 * their own features and are composed by the route (src/routes/integrations.tsx); this screen only gives
 * them the page and the order.
 */
export function IntegrationsScreen({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("integrations");
  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} />
      <Stack gap="md">{children}</Stack>
      <Text size="xs" tone="muted">{t("page.footer")}</Text>
    </PageContainer>
  );
}
