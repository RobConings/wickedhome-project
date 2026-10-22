import { useTranslation } from "react-i18next";
import { useLocation, useNavigation } from "react-router";
import { Stack } from "./stack";
import { GeneralForm } from "./general-form";
import type { FormResult } from "../lib/forms";
import type { Locale } from "@/types/common";
import { setupInputSchema } from "../types/auth";

type SetupFormProps = {
  /** Language the owner account starts with: the one the form is shown in. */
  locale: Locale;
  result?: FormResult;
};

export function SetupForm({ locale, result }: SetupFormProps) {
  const { t } = useTranslation("auth");
  const navigation = useNavigation();
  const location = useLocation();
  const opening = navigation.state === "loading" && navigation.location.pathname !== location.pathname;

  return (
    <GeneralForm
      navigate
      result={result}
      schema={setupInputSchema}
      hiddenFields={{ locale }}
      fields={[
        {
          name: "householdName",
          type: "text",
          label: t("fields.householdName"),
          description: t("setup.householdNameHint"),
          autoFocus: true,
        },
        { name: "name", type: "text", autoComplete: "given-name", label: t("fields.name") },
        { name: "email", type: "text", inputType: "email", inputMode: "email", autoComplete: "username", label: t("fields.email") },
        {
          name: "password",
          type: "text",
          inputType: "password",
          autoComplete: "new-password",
          label: t("fields.password"),
          description: t("setup.passwordHint"),
        },
      ]}
      submitSize="lg"
      submitLabel={t("setup.submit")}
      submittingLabel={opening ? t("setup.opening") : t("setup.submitting")}
      renderActions={(buttons) => <Stack className="mt-2">{buttons}</Stack>}
    />
  );
}
