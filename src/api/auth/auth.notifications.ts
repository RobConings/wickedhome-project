import type { Role } from "@/features/auth/types/auth";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { notifyInBackground } from "../notifications/notify";

/** "Clara joined WickedHome": an invite link was used (docs/NOTIFICATIONS.md). To who made the invite, else the owners. */
export const INVITE_ACCEPTED_KIND = "auth.invite-accepted";

registerNotificationKind({
  id: INVITE_ACCEPTED_KIND,
  group: "accounts",
  titleKey: "auth:notifications.inviteAccepted.title",
  descriptionKey: "auth:notifications.inviteAccepted.description",
  roles: ["owner", "adult"],
});

const ROLE_WORD: Record<Role, { en: string; nl: string }> = {
  owner: { en: "owner", nl: "eigenaar" },
  adult: { en: "adult", nl: "volwassene" },
  child: { en: "child", nl: "kind" },
};

export function notifyInviteAccepted(accepted: { householdId: string; userId: string; name: string; role: Role; createdById: string | null }): void {
  notifyInBackground({
    householdId: accepted.householdId,
    kind: INVITE_ACCEPTED_KIND,
    ...(accepted.createdById ? { userIds: [accepted.createdById], fallbackToHousehold: true } : {}),
    roles: ["owner", "adult"],
    excludeUserIds: [accepted.userId],
    url: "/settings#accounts",
    content: (locale) =>
      locale === "nl"
        ? { title: `${accepted.name} doet nu mee in WickedHome`, body: `Aangemeld met de uitnodiging, als ${ROLE_WORD[accepted.role].nl}.` }
        : { title: `${accepted.name} joined WickedHome`, body: `Signed up with the invite link, as ${ROLE_WORD[accepted.role].en}.` },
  });
}
