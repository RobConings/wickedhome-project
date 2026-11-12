import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";

type RetailerMember = { id: string; name: string; role: string };

/** The same household grants editor for Xtra and Collect&Go. Owners must select their own account too. */
export function RetailerAccountAccess({ members, userIds, onChange, disabled, actions }: {
  members: readonly RetailerMember[];
  userIds: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  const { t } = useTranslation("shopping");
  return <fieldset disabled={disabled} className="rounded-lg border p-3">
    <legend className="px-1 text-sm font-medium">{t("xtra.accounts")}</legend>
    <Stack gap="3">
      {members.map((member) => <label key={member.id} className="flex min-h-10 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-primary" checked={userIds.includes(member.id)}
          onChange={(event) => onChange(event.target.checked ? [...userIds, member.id] : userIds.filter((id) => id !== member.id))} />
        <span>{member.name}{member.role === "child" && <span className="ml-2 text-muted-foreground">{t("xtra.readOnly")}</span>}</span>
      </label>)}
      {actions && <Inline gap="none">{actions}</Inline>}
    </Stack>
  </fieldset>;
}
