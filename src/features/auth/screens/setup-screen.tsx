import { useTranslation } from "react-i18next";
import { CenteredLayout } from "@/components/layout/centered-layout";
import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { BrandMark } from "@/components/shared/brand-mark";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import type { FormResult } from "@/lib/forms";
import { currentLocale, setLocale } from "@/lib/i18n";
import { SetupForm } from "../components/setup-form";

type SetupScreenProps = {
  result?: FormResult;
};

/** First run: create the household and the owner account. */
export function SetupScreen({ result }: SetupScreenProps) {
  const { t } = useTranslation("auth");
  const locale = currentLocale();

  return (
    <CenteredLayout>
      <Stack gap="lg">
        <Inline justify="between">
          <BrandMark withTagline />
          <LanguageSwitcher value={locale} onChange={(next) => void setLocale(next)} />
        </Inline>
        <Card className="gap-6 p-6 sm:p-8">
          <Stack gap="xs">
            <CardTitle className="text-xl">{t("setup.title")}</CardTitle>
            <CardDescription>{t("setup.description")}</CardDescription>
          </Stack>
          <SetupForm locale={locale} result={result} />
        </Card>
      </Stack>
    </CenteredLayout>
  );
}
