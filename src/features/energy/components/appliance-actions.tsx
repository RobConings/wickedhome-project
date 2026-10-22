import * as React from "react";
import { PaperclipIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import type { Place } from "@/features/places";
import type { EnergyActionResult } from "../data/energy-loaders";
import { applianceDeleteKey } from "../data/use-appliance-deleting";
import type { Appliance } from "../types/energy";
import { ApplianceFormDialog } from "./appliance-form-dialog";

type ApplianceActionsProps = {
  appliance: Appliance;
  /** Places for the edit dialog. */
  places: Place[];
  canManage: boolean;
  /** The appliance's documents (rendered by the route), shown in a dialog behind a paperclip, for every role. */
  documents?: React.ReactNode;
  className?: string;
};

/** Icon buttons of an appliance: its documents, edit and delete (with a confirmation). */
export function ApplianceActions({ appliance, places, canManage, documents, className }: ApplianceActionsProps) {
  const { t } = useTranslation("energy");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<EnergyActionResult>({ key: applianceDeleteKey(appliance.id) });

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  if (!canManage && !documents) return null;

  return (
    <div className={cn("flex shrink-0 gap-1", className)}>
      {documents && (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("appliances.documents.open", { name: appliance.name })}
              title={t("appliances.documents.label")}
            >
              <PaperclipIcon />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{appliance.name}</DialogTitle>
              <DialogDescription>{t("appliances.documents.description")}</DialogDescription>
            </DialogHeader>
            {documents}
          </DialogContent>
        </Dialog>
      )}
      {canManage && (
        <>
          <ApplianceFormDialog
            appliance={appliance}
            places={places}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`${tCommon("actions.edit")}: ${appliance.name}`}>
                <PencilIcon />
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                aria-label={`${tCommon("actions.delete")}: ${appliance.name}`}
              >
                <Trash2Icon />
              </Button>
            }
            title={t("appliances.delete.title", { name: appliance.name })}
            description={t("appliances.delete.description")}
            confirmLabel={tCommon("actions.delete")}
            cancelLabel={tCommon("actions.cancel")}
            destructive
            onConfirm={() => fetcher.submit({ intent: "delete", id: appliance.id }, { method: "post" })}
          />
        </>
      )}
    </div>
  );
}
