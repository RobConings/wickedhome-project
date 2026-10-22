import type * as React from "react";
import { CircleAlertIcon, ClockIcon, LinkIcon, LogOutIcon, UserCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Form, Link, useNavigation } from "react-router";
import { Button } from "@/components/ui/button";
import { CenteredLayout } from "../components/centered-layout";
import { Inline } from "../components/inline";
import { Stack } from "../components/stack";
import { BrandMark } from "../components/brand-mark";
import { Card, CardDescription, CardTitle } from "../components/card";
import { LanguageSwitcher } from "../components/language-switcher";
import { currentLocale, setLocale } from "@/lib/i18n";
import { LinkAcceptForm } from "../components/link-accept-form";
import { LINK_LOGOUT_INTENT, type LinkActionResult, type LinkLoaderData } from "../data/link-loaders";

type LinkScreenProps = {
  data: LinkLoaderData;
  result?: LinkActionResult;
  /** Stories: show the form as submitting. */
  forceBusy?: boolean;
};

function Message({ icon: Icon, title, description, children }: { icon: typeof LinkIcon; title: string; description: string; children?: React.ReactNode }) {
  return (
    <Stack gap="lg" className="items-center text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <Stack gap="xs">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </Stack>
      {children}
    </Stack>
  );
}

/**
 * `/invite/:token` and `/reset/:token`: opened from a link or QR code, mostly on a phone. Shows who the link
 * is for and lets them create their account (or set a new password); explains clearly when the link can't
 * be used, and asks to log out first when someone is already logged in on this device.
 */
export function LinkScreen({ data, result, forceBusy }: LinkScreenProps) {
  const { t } = useTranslation("auth");
  const navigation = useNavigation();
  const locale = currentLocale();
  const { preview, problem, currentUser } = data;
  const loggingOut = navigation.state !== "idle" && navigation.formData?.get("intent") === LINK_LOGOUT_INTENT;
  const askFor = (name: string | null) => (name ? t("link.askName", { name }) : t("link.askSomeone"));

  let content: React.ReactNode;
  if (problem || !preview) {
    content =
      problem === "rateLimited" ? (
        <Message icon={ClockIcon} title={t("link.rateLimited.title")} description={t("link.rateLimited.description")} />
      ) : problem === "unavailable" ? (
        <Message icon={CircleAlertIcon} title={t("link.unavailable.title")} description={t("link.unavailable.description")}>
          <Button size="lg" variant="outline" onClick={() => window.location.reload()}>
            {t("link.unavailable.retry")}
          </Button>
        </Message>
      ) : (
        <Message icon={LinkIcon} title={t("link.invalid.title")} description={t("link.invalid.description")} />
      );
  } else if (preview.status !== "valid") {
    const kind = preview.kind === "invite" ? "invite" : "reset";
    content = (
      <Message
        icon={ClockIcon}
        title={t(`link.${preview.status}.${kind}Title`)}
        description={`${t(`link.${preview.status}.description`)} ${askFor(preview.inviterName)}`}
      >
        {preview.status === "used" && !currentUser && (
          <Button asChild size="lg" className="w-full">
            <Link to="/login">{t("link.toLogin")}</Link>
          </Button>
        )}
      </Message>
    );
  } else if (currentUser) {
    content = (
      <Message
        icon={UserCheckIcon}
        title={t("link.loggedIn.title", { name: currentUser.name })}
        description={preview.kind === "invite" ? t("link.loggedIn.inviteDescription", { name: preview.name }) : t("link.loggedIn.resetDescription", { name: preview.name })}
      >
        <Stack gap="sm" className="w-full">
          <Form method="post" replace>
            <input type="hidden" name="intent" value={LINK_LOGOUT_INTENT} />
            <Button type="submit" size="lg" loading={loggingOut} className="h-12 w-full text-base">
              <LogOutIcon />
              {loggingOut ? t("account.loggingOut") : t("link.loggedIn.logout")}
            </Button>
          </Form>
          <Button asChild size="lg" variant="outline" className="h-12 w-full text-base">
            <Link to="/">{t("link.loggedIn.toHome")}</Link>
          </Button>
        </Stack>
      </Message>
    );
  } else {
    const invite = preview.kind === "invite";
    content = (
      <Stack gap="lg">
        <Stack gap="xs">
          <CardTitle className="text-xl">
            {invite ? t("link.invite.title", { household: preview.householdName }) : t("link.reset.title")}
          </CardTitle>
          <CardDescription>
            {invite
              ? t("link.invite.description", {
                  name: preview.name,
                  role: t(`roles.${preview.role}`),
                  inviter: preview.inviterName ?? preview.householdName,
                })
              : t("link.reset.description", { name: preview.name, email: preview.email ?? "" })}
          </CardDescription>
        </Stack>
        <LinkAcceptForm kind={preview.kind} email={preview.email} locale={locale} result={result} forceBusy={forceBusy} />
      </Stack>
    );
  }

  return (
    <CenteredLayout>
      <Stack gap="lg">
        <Inline justify="between">
          <BrandMark withTagline />
          <LanguageSwitcher value={locale} onChange={(next) => void setLocale(next)} />
        </Inline>
        <Card className="gap-6 p-5 sm:p-8">{content}</Card>
      </Stack>
    </CenteredLayout>
  );
}
