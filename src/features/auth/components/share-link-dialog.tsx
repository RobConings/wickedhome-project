import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Stack } from "@/components/layout/stack";
import type { LinkKind } from "../types/accounts";
import { ShareLinkPanel } from "./share-link-panel";

export type SharedLink = {
  url: string;
  kind: LinkKind;
  personName: string;
  expiresAt: string;
};

type ShareLinkDialogProps = {
  /** The link to show; `null` closes the dialog. */
  link: SharedLink | null;
  householdName: string;
  onClose: () => void;
};

/** Shows a link made earlier in this session (an invite to copy again, or a fresh password-reset link). */
export function ShareLinkDialog({ link, householdName, onClose }: ShareLinkDialogProps) {
  const { t } = useTranslation("auth");
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        {link && (
          <Stack gap="lg">
            <DialogHeader>
              <DialogTitle>
                {link.kind === "invite"
                  ? t("invite.readyTitle", { name: link.personName })
                  : t("accounts.resetReadyTitle", { name: link.personName })}
              </DialogTitle>
              <DialogDescription>
                {link.kind === "invite" ? t("invite.readyDescription") : t("accounts.resetReadyDescription")}
              </DialogDescription>
            </DialogHeader>
            <ShareLinkPanel
              url={link.url}
              kind={link.kind}
              personName={link.personName}
              householdName={householdName}
              expiresAt={link.expiresAt}
            />
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={onClose}>
                {t("invite.done")}
              </Button>
            </DialogFooter>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
