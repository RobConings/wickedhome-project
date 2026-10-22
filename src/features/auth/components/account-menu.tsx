import * as React from "react";
import { ChevronsUpDownIcon, LogOutIcon, UserCogIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { setLocale } from "@/lib/i18n";
import { setThemePreference, useTheme, type ThemePreference } from "@/lib/theme";
import { LOCALES, type Locale } from "@/types/common";
import { updateAccount } from "../data/auth-requests";
import type { SessionUser } from "../types/auth";

const THEMES: ThemePreference[] = ["system", "light", "dark"];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

type AccountMenuProps = {
  user: SessionUser;
};

/** Who is logged in, plus language, theme and logout. Shows only the avatar below the `lg` breakpoint. */
export function AccountMenu({ user }: AccountMenuProps) {
  const { t } = useTranslation();
  const { t: tAuth } = useTranslation("auth");
  const theme = useTheme();
  const revalidator = useRevalidator();
  const logoutFetcher = useFetcher();
  const loggingOut = logoutFetcher.state !== "idle";
  // The language being saved: checked at once, while the account and the session reload.
  const [savingLocale, setSavingLocale] = React.useState<Locale | null>(null);

  async function changeLocale(locale: Locale) {
    const previous = user.locale;
    setSavingLocale(locale);
    try {
      await setLocale(locale);
      await updateAccount({ locale });
      await revalidator.revalidate();
    } catch {
      await setLocale(previous);
      toast.error(tAuth("account.localeFailed"));
    } finally {
      setSavingLocale(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg p-1.5 text-left outline-none hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring lg:w-full">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 flex-1 flex-col lg:flex">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.householdName}</span>
        </span>
        <ChevronsUpDownIcon className="hidden size-4 text-muted-foreground lg:block" aria-hidden="true" />
        <span className="sr-only">{tAuth("account.menu")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span>{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/settings#account">
            <UserCogIcon />
            {tAuth("account.myAccount")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("language.label")}
          {savingLocale && <Spinner className="size-3" />}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={savingLocale ?? user.locale}
          onValueChange={(value) => void changeLocale(value as Locale)}
        >
          {LOCALES.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} disabled={savingLocale !== null}>
              {t(`language.${locale}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme.preference}
          onValueChange={(value) => setThemePreference(value as ThemePreference)}
        >
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(`theme.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={loggingOut}
          aria-busy={loggingOut || undefined}
          onSelect={(event) => {
            // Stay open with a spinner until the login page takes over.
            event.preventDefault();
            void logoutFetcher.submit(null, { method: "post", action: "/logout" });
          }}
        >
          {loggingOut ? <Spinner /> : <LogOutIcon />}
          {loggingOut ? tAuth("account.loggingOut") : tAuth("account.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
