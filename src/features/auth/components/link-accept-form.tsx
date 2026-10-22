import { useTranslation } from "react-i18next";
import { useLocation, useNavigation } from "react-router";
import { z } from "zod";
import { Stack } from "@/components/layout/stack";
import { GeneralForm, type GeneralFormField } from "@/components/shared/general-form";
import { SegmentedControl } from "@/components/shared/segmented-control";
import type { FormResult } from "@/lib/forms";
import { setLocale } from "@/lib/i18n";
import { LOCALES, type Locale } from "@/types/common";
import { LINK_ACCEPT_INTENT } from "../data/link-loaders";
import { acceptInviteInputSchema, resetPasswordInputSchema, type LinkKind } from "../types/accounts";

type LinkAcceptFormProps = {
  kind: LinkKind;
  /** Password reset: the account's email, for password managers. */
  email?: string | null;
  /** The language the form is shown in; the new account starts with it. */
  locale: Locale;
  result?: FormResult;
  /** Stories: show the busy state. */
  forceBusy?: boolean;
};

/** Create the account from an invite, or set a new password from a reset link. */
export function LinkAcceptForm({ kind, email, locale, result, forceBusy = false }: LinkAcceptFormProps) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const navigation = useNavigation();
  const location = useLocation();
  const opening = navigation.state === "loading" && navigation.location.pathname !== location.pathname;
  const invite = kind === "invite";

  // The browser checks what it can; the token comes from the URL and is added by the action.
  const confirm = {
    confirmPassword: z.string().max(200).optional(),
  };
  const passwordsMatch = (value: { password: string; confirmPassword?: string }) => value.password === value.confirmPassword;
  const mismatch = { message: t("link.passwordMismatch"), path: ["confirmPassword"] };
  const schema = invite
    ? acceptInviteInputSchema.omit({ token: true }).extend(confirm).refine(passwordsMatch, mismatch)
    : resetPasswordInputSchema.omit({ token: true }).extend(confirm).refine(passwordsMatch, mismatch);

  const passwordFields: GeneralFormField[] = [
    {
      name: "password",
      type: "text",
      inputType: "password",
      autoComplete: "new-password",
      label: invite ? t("fields.password") : t("link.newPassword"),
      description: t("setup.passwordHint"),
    },
    {
      name: "confirmPassword",
      type: "text",
      inputType: "password",
      autoComplete: "new-password",
      label: t("fields.confirmPassword"),
      optional: false,
    },
  ];

  const fields: GeneralFormField[] = invite
    ? [
        {
          name: "email",
          type: "text",
          inputType: "email",
          inputMode: "email",
          autoComplete: "email",
          label: t("fields.email"),
          description: t("link.emailHint"),
        },
        {
          name: "locale",
          type: "custom",
          label: tCommon("language.label"),
          bare: true,
          render: ({ name }) => (
            <Stack gap="sm">
              <span className="text-sm font-medium">{tCommon("language.label")}</span>
              <input type="hidden" name={name} value={locale} />
              <SegmentedControl
                label={tCommon("language.label")}
                value={locale}
                options={LOCALES.map((value) => ({ value, label: tCommon(`language.${value}`) }))}
                onChange={(next) => void setLocale(next)}
                className="self-start"
              />
            </Stack>
          ),
        },
        ...passwordFields,
      ]
    : passwordFields;

  return (
    <GeneralForm
      navigate
      result={result}
      busy={forceBusy}
      schema={schema}
      intent={LINK_ACCEPT_INTENT}
      hiddenFields={{ kind }}
      // Lets the password manager store the new password with the right account.
      intro={!invite && <input type="text" name="username" autoComplete="username" value={email ?? ""} hidden readOnly />}
      fields={fields}
      submitSize="lg"
      submitLabel={invite ? t("link.invite.submit") : t("link.reset.submit")}
      submittingLabel={opening ? t("setup.opening") : invite ? t("link.invite.submitting") : t("link.reset.submitting")}
      renderActions={(buttons) => <Stack className="mt-2 [&_button]:h-12 [&_button]:text-base">{buttons}</Stack>}
    />
  );
}
