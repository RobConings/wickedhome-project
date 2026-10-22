import { useTranslation } from "react-i18next";
import { CenteredLayout } from "../components/centered-layout";
import { Inline } from "../components/inline";
import { Stack } from "../components/stack";
import { BrandMark } from "../components/brand-mark";
import { Card, CardDescription, CardTitle } from "../components/card";
import { LanguageSwitcher } from "../components/language-switcher";
import type { FormResult } from "../lib/forms";
import { currentLocale, setLocale } from "@/lib/i18n";
import { LoginForm } from "../components/login-form";

type LoginScreenProps = {
  result?: FormResult;
};

export function LoginScreen({ result }: LoginScreenProps) {
  const { t } = useTranslation("auth");

  return (
    <CenteredLayout>
      <Stack gap="lg">
        <Inline justify="between">
          <BrandMark withTagline />
          <LanguageSwitcher value={currentLocale()} onChange={(locale) => void setLocale(locale)} />
        </Inline>
        <Card className="gap-6 p-6 sm:p-8">
          <Stack gap="xs">
            <CardTitle className="text-xl">{t("login.title")}</CardTitle>
            <CardDescription>{t("login.description")}</CardDescription>
          </Stack>
          <LoginForm result={result} />
        </Card>
      </Stack>
    </CenteredLayout>
  );
}
