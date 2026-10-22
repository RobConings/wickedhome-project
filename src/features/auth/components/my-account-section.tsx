import * as React from "react";
import { LaptopIcon, LogOutIcon, SmartphoneIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stack } from "@/components/layout/stack";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { FormField } from "@/components/shared/form-field";
import { InlineAlert } from "@/components/shared/inline-alert";
import { SkeletonList } from "@/components/shared/loading-state";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ApiRequestError } from "@/lib/api-client";
import { formDataToObject } from "@/lib/forms";
import { currentLocale, setLocale } from "@/lib/i18n";
import { LOCALES, type Locale } from "@/types/common";
import { myAccountClient, type MyAccountClient } from "../data/accounts-requests";
import { updateAccount } from "../data/auth-requests";
import { changeEmailInputSchema, changePasswordFormSchema, type DeviceSession, type MyAccount } from "../types/accounts";
import type { SessionUser } from "../types/auth";
import { describeUserAgent } from "./account-format";
import { formatRelativeTime } from "@/lib/format";

type MyAccountSectionProps = {
  /**
   * Your devices, from the Settings route's loader: the data or a deferred promise of it. `null` (loading
   * failed) shows an error with Retry in the devices block only; the forms always work.
   */
  data?: MyAccount | null | Promise<MyAccount | null>;
  user: Pick<SessionUser, "email" | "locale">;
  /** API access; stories pass a fake. */
  client?: MyAccountClient;
  /** Stories: language changes without touching the real account. */
  onLocaleChange?: (locale: Locale) => Promise<void>;
};

type FormState = { busy: boolean; errors: Record<string, string[]>; formError: string | null };
const idle: FormState = { busy: false, errors: {}, formError: null };

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) (errors[issue.path.join(".") || "_"] ??= []).push(issue.message);
  return errors;
}

/** Settings → My account (everyone): email, password, language and the devices you're logged in on. */
export function MyAccountSection({ data, user, client = myAccountClient, onLocaleChange }: MyAccountSectionProps) {
  const { t } = useTranslation("auth");
  return (
    <Card className="gap-0 divide-y p-0">
      <div className="p-4 sm:p-6">
        <EmailForm user={user} client={client} />
      </div>
      <div className="p-4 sm:p-6">
        <PasswordForm client={client} />
      </div>
      <div className="p-4 sm:p-6">
        <LanguagePicker value={user.locale} onLocaleChange={onLocaleChange} />
      </div>
      <section aria-label={t("myAccount.devices.title")} className="p-4 sm:p-6">
        {data instanceof Promise ? (
          <React.Suspense fallback={<DevicesSkeleton />}>
            <DeferredDevices promise={data} client={client} />
          </React.Suspense>
        ) : (
          <Devices data={data} client={client} />
        )}
      </section>
    </Card>
  );
}

function useMessages() {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  return (error: unknown): Partial<FormState> => {
    if (error instanceof ApiRequestError) {
      if (error.code === "wrong_password") return { errors: { currentPassword: [t("myAccount.wrongPassword")] } };
      if (error.code === "email_taken") return { errors: { email: [t("link.errors.emailTaken")] } };
      if (error.status === 429) return { formError: tCommon("errors.tooManyAttempts") };
      if (error.fields) return { errors: error.fields };
    }
    return { formError: tCommon("errors.generic") };
  };
}

function EmailForm({ user, client }: { user: MyAccountSectionProps["user"]; client: MyAccountClient }) {
  const { t } = useTranslation("auth");
  const revalidator = useRevalidator();
  const toMessages = useMessages();
  const [state, setState] = React.useState<FormState>(idle);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = changeEmailInputSchema.safeParse(formDataToObject(new FormData(form)));
    if (!parsed.success) return setState({ ...idle, errors: fieldErrors(parsed.error) });
    if (parsed.data.email === user.email) return setState({ ...idle, errors: { email: [t("myAccount.email.same")] } });
    setState({ ...idle, busy: true });
    try {
      await client.changeEmail(parsed.data);
      setState(idle);
      const password = form.elements.namedItem("currentPassword");
      if (password instanceof HTMLInputElement) password.value = "";
      toast.success(t("myAccount.email.saved", { email: parsed.data.email }));
      await revalidator.revalidate();
    } catch (error) {
      setState({ ...idle, ...toMessages(error) });
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <fieldset disabled={state.busy} className="min-w-0">
        <Stack gap="md">
          <Stack gap="xs">
            <h3 className="font-semibold">{t("myAccount.email.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("myAccount.email.description")}</p>
          </Stack>
          {state.formError && <InlineAlert tone="error">{state.formError}</InlineAlert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("fields.email")} htmlFor="my-email" errors={state.errors.email}>
              <Input id="my-email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={user.email} className="h-10" />
            </FormField>
            <FormField label={t("myAccount.currentPassword")} htmlFor="my-email-password" errors={state.errors.currentPassword}>
              <Input id="my-email-password" name="currentPassword" type="password" autoComplete="current-password" className="h-10" />
            </FormField>
          </div>
          <div>
            <Button type="submit" size="lg" loading={state.busy} className="w-full sm:w-auto">
              {state.busy ? t("myAccount.saving") : t("myAccount.email.submit")}
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}

function PasswordForm({ client }: { client: MyAccountClient }) {
  const { t } = useTranslation("auth");
  const toMessages = useMessages();
  const [state, setState] = React.useState<FormState>(idle);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = changePasswordFormSchema.safeParse(formDataToObject(new FormData(form)));
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      if (errors.confirmPassword?.includes("mismatch")) errors.confirmPassword = [t("link.passwordMismatch")];
      return setState({ ...idle, errors });
    }
    setState({ ...idle, busy: true });
    try {
      await client.changePassword({ currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword });
      setState(idle);
      form.reset();
      toast.success(t("myAccount.password.saved"));
    } catch (error) {
      setState({ ...idle, ...toMessages(error) });
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="text" name="username" autoComplete="username" hidden readOnly />
      <fieldset disabled={state.busy} className="min-w-0">
        <Stack gap="md">
          <Stack gap="xs">
            <h3 className="font-semibold">{t("myAccount.password.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("myAccount.password.description")}</p>
          </Stack>
          {state.formError && <InlineAlert tone="error">{state.formError}</InlineAlert>}
          <FormField label={t("myAccount.currentPassword")} htmlFor="my-current-password" errors={state.errors.currentPassword}>
            <Input id="my-current-password" name="currentPassword" type="password" autoComplete="current-password" className="h-10" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("myAccount.password.new")} htmlFor="my-new-password" description={t("setup.passwordHint")} errors={state.errors.newPassword}>
              <Input id="my-new-password" name="newPassword" type="password" autoComplete="new-password" minLength={10} className="h-10" />
            </FormField>
            <FormField label={t("fields.confirmPassword")} htmlFor="my-confirm-password" errors={state.errors.confirmPassword}>
              <Input id="my-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" className="h-10" />
            </FormField>
          </div>
          <div>
            <Button type="submit" size="lg" loading={state.busy} className="w-full sm:w-auto">
              {state.busy ? t("myAccount.saving") : t("myAccount.password.submit")}
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}

function LanguagePicker({ value, onLocaleChange }: { value: Locale; onLocaleChange?: (locale: Locale) => Promise<void> }) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const revalidator = useRevalidator();
  const [saving, setSaving] = React.useState<Locale | null>(null);

  async function change(locale: Locale) {
    const previous = currentLocale();
    setSaving(locale);
    try {
      if (onLocaleChange) {
        await onLocaleChange(locale);
      } else {
        await setLocale(locale);
        await updateAccount({ locale });
        await revalidator.revalidate();
      }
    } catch {
      await setLocale(previous);
      toast.error(t("account.localeFailed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <h3 className="font-semibold">{tCommon("language.label")}</h3>
        <p className="text-sm text-muted-foreground">{t("myAccount.languageDescription")}</p>
      </Stack>
      <SegmentedControl
        label={tCommon("language.label")}
        value={saving ?? value}
        options={LOCALES.map((locale) => ({ value: locale, label: tCommon(`language.${locale}`) }))}
        onChange={(locale) => !saving && void change(locale)}
        className="self-start"
      />
    </Stack>
  );
}

function DevicesSkeleton() {
  const { t } = useTranslation("auth");
  return (
    <div aria-busy="true" aria-label={t("myAccount.devices.loading")}>
      <SkeletonList rows={2} />
    </div>
  );
}

function DeferredDevices({ promise, client }: { promise: Promise<MyAccount | null>; client: MyAccountClient }) {
  return <Devices data={React.use(promise)} client={client} />;
}

type DevicesState = { status: "loading" } | { status: "error" } | { status: "ready"; sessions: DeviceSession[] };
const devicesState = (data: MyAccount | null | undefined): DevicesState =>
  data ? { status: "ready", sessions: data.sessions } : data === null ? { status: "error" } : { status: "loading" };

function Devices({ data, client }: { data?: MyAccount | null; client: MyAccountClient }) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const [state, setState] = React.useState<DevicesState>(() => devicesState(data));
  const [reloads, setReloads] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const locale = currentLocale();

  const [previousData, setPreviousData] = React.useState(data);
  if (data !== previousData) {
    setPreviousData(data);
    if (data !== undefined) setState(devicesState(data));
  }

  React.useEffect(() => {
    if (data !== undefined && reloads === 0) return;
    let cancelled = false;
    client
      .get()
      .then((account) => !cancelled && setState({ status: "ready", sessions: account.sessions }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [client, data, reloads]);

  async function signOutOthers() {
    try {
      const { signedOut } = await client.signOutOthers();
      toast.success(t("myAccount.devices.signedOut", { count: signedOut }));
      const account = await client.get();
      setState({ status: "ready", sessions: account.sessions });
      setNow(Date.now());
    } catch {
      toast.error(tCommon("errors.generic"));
    }
  }

  const header = (
    <Stack gap="xs">
      <h3 className="font-semibold">{t("myAccount.devices.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("myAccount.devices.description")}</p>
    </Stack>
  );

  if (state.status === "loading") {
    return (
      <Stack gap="md">
        {header}
        <DevicesSkeleton />
      </Stack>
    );
  }
  if (state.status === "error") {
    return (
      <Stack gap="md">
        {header}
        <ErrorState
          className="py-6"
          title={t("myAccount.devices.error")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setState({ status: "loading" });
                setReloads((value) => value + 1);
              }}
            >
              {tCommon("actions.retry")}
            </Button>
          }
        />
      </Stack>
    );
  }

  const others = state.sessions.filter((session) => !session.current).length;
  return (
    <Stack gap="md">
      {header}
      <ul className="flex flex-col divide-y rounded-lg border">
        {state.sessions.map((session) => {
          const { browser, system } = describeUserAgent(session.userAgent);
          const mobile = system === "iPhone" || system === "Android" || system === "iPad";
          const Icon = mobile ? SmartphoneIcon : LaptopIcon;
          const label =
            browser && system
              ? t("myAccount.devices.browserOn", { browser, system })
              : (browser ?? system ?? t("myAccount.devices.unknown"));
          return (
            <li key={session.key} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {label}
                  {session.current && <Badge variant="secondary">{t("myAccount.devices.thisDevice")}</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {session.current
                    ? t("myAccount.devices.activeNow")
                    : t("myAccount.devices.lastSeen", { when: formatRelativeTime(session.lastSeenAt, locale, now) })}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="lg" disabled={others === 0} className="w-full sm:w-auto">
              <LogOutIcon />
              {t("myAccount.devices.signOutOthers")}
            </Button>
          }
          title={t("myAccount.devices.confirmTitle")}
          description={t("myAccount.devices.confirmDescription", { count: others })}
          confirmLabel={t("myAccount.devices.signOutOthers")}
          onConfirm={signOutOthers}
        />
      </div>
    </Stack>
  );
}
