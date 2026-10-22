import { BellIcon, HistoryIcon, PlugIcon, UserCogIcon, UsersIcon, WorkflowIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { ActivitySection } from "@/features/audit";
import { AccountsSection, MyAccountSection, canManageAccounts, fetchAccounts, fetchMyAccount, useCurrentUser } from "@/features/auth";
import { AutomationsSection, fetchAutomations } from "@/features/automations";
import { canManageHouseholdSettings } from "@/features/household";
import { IntegrationsSettingsLink } from "@/features/integrations";
import { NotificationSettingsSection } from "@/features/notifications";
import { SettingsScreen, settingsAction, settingsLoader, type SettingsSectionItem } from "@/features/settings";
import { optionalData } from "@/lib/loaders";

/** Deferred section data: a skeleton until it arrives; a failure only empties that section. */
export async function loader() {
  const automations = optionalData(fetchAutomations(), "Settings: automations");
  const myAccount = optionalData(fetchMyAccount(), "Settings: my account");
  // Children get a 403 here (→ null); their page doesn't show the Accounts section anyway.
  const accounts = optionalData(fetchAccounts(), "Settings: accounts");
  return { ...(await settingsLoader()), automations, myAccount, accounts };
}

export const action = settingsAction;

export function Component() {
  const user = useCurrentUser();
  const { t } = useTranslation("automations");
  const { t: tAuth } = useTranslation("auth");
  const { t: tIntegrations } = useTranslation("integrations");
  const { t: tAudit } = useTranslation("audit");
  const { t: tNotifications } = useTranslation("notifications");
  const data = useLoaderData<typeof loader>();

  const accountSections: SettingsSectionItem[] = [
    {
      id: "account",
      icon: UserCogIcon,
      title: tAuth("myAccount.section.title"),
      description: tAuth("myAccount.section.description"),
      content: <MyAccountSection data={data.myAccount} user={user} />,
    },
    // Everyone's own notifications: this device, devices, quiet hours, what and when (loads its own data).
    {
      id: "notifications",
      icon: BellIcon,
      title: tNotifications("section.title"),
      description: tNotifications("section.description"),
      content: <NotificationSettingsSection />,
    },
  ];
  if (canManageAccounts(user.role)) {
    accountSections.push({
      id: "accounts",
      icon: UsersIcon,
      title: tAuth("accounts.section.title"),
      description: tAuth("accounts.section.description"),
      content: <AccountsSection data={data.accounts} actor={user} />,
    });
    // The activity log (owners and adults, the same people who manage accounts); it loads its own data.
    accountSections.push({
      id: "activity",
      icon: HistoryIcon,
      title: tAudit("section.title"),
      description: tAudit("section.description"),
      content: <ActivitySection />,
    });
  }

  return (
    <SettingsScreen
      data={data}
      canManage={canManageHouseholdSettings(user.role)}
      extraSections={[
        ...accountSections,
        {
          id: "automations",
          icon: WorkflowIcon,
          title: t("section.title"),
          description: t("section.description"),
          content: <AutomationsSection data={data.automations} />,
        },
        {
          id: "integrations",
          icon: PlugIcon,
          title: tIntegrations("settingsLink.title"),
          description: tIntegrations("settingsLink.description"),
          content: <IntegrationsSettingsLink />,
        },
      ]}
    />
  );
}
