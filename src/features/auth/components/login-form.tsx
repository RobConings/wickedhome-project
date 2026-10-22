import { useTranslation } from "react-i18next";
import { useLocation, useNavigation } from "react-router";
import { Stack } from "./stack";
import { GeneralForm } from "./general-form";
import type { FormResult } from "../lib/forms";
import { loginInputSchema } from "../types/auth";

type LoginFormProps = {
  result?: FormResult;
};

export function LoginForm({ result }: LoginFormProps) {
  const { t } = useTranslation("auth");
  const navigation = useNavigation();
  const location = useLocation();
  const opening = navigation.state === "loading" && navigation.location.pathname !== location.pathname;

  return (
    <GeneralForm
      navigate
      result={result}
      schema={loginInputSchema}
      fields={[
        { name: "email", type: "text", inputType: "email", inputMode: "email", autoComplete: "username", label: t("fields.email"), autoFocus: true },
        { name: "password", type: "text", inputType: "password", autoComplete: "current-password", label: t("fields.password") },
      ]}
      submitSize="lg"
      submitLabel={t("login.submit")}
      submittingLabel={opening ? t("login.opening") : t("login.submitting")}
      renderActions={(buttons) => <Stack className="mt-2">{buttons}</Stack>}
    />
  );
}
