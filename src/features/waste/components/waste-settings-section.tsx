import * as React from "react";
import { PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PendingContent } from "@/components/shared/loading-state";
import type { Habitant } from "@/features/household";
import type { WasteActionResult } from "../data/waste-requests";
import type { WasteSettings } from "../types/waste";
import { WasteDayList } from "./waste-day-list";
import { WasteSetupForm, type WasteAddressDefaults } from "./waste-setup-form";
import { WasteTaskSettings } from "./waste-task-settings";
import { useFetcherResult } from "@/lib/hooks/use-fetcher-result";
import { dateTimeText } from "@/lib/locale-text";
import { IconCardHeader } from "@/components/shared/icon-card-header";

type WasteSettingsSectionProps = {
  settings: WasteSettings;
  /** The home address, to prefill the lookup. */
  defaults: WasteAddressDefaults;
  canManage: boolean;
  /** Today, `YYYY-MM-DD` in the household time zone. */
  today: string;
  /** For "who puts the bins out". */
  habitants?: Habitant[];
};


/**
 * Settings section for the waste collector: the connected provider and address with the sync state and
 * the next collections and the bins-task option, or the setup form. Collections also appear on the
 * calendar and the dashboard.
 */
export function WasteSettingsSection({ settings, defaults, canManage, today, habitants = [] }: WasteSettingsSectionProps) {
  const { t } = useTranslation("waste");
  const [editing, setEditing] = React.useState(false);
  const sync = useFetcher<WasteActionResult>({ key: "waste-sync" });
  const remove = useFetcher<WasteActionResult>({ key: "waste-remove" });
  const syncing = sync.state !== "idle";
  const { setup } = settings;
  useFetcherResult(sync, (result) => {
    if (result.formError) toast.error(result.formError);
    else if (result.setup?.lastSyncStatus === "error") toast.warning(t("sync.failed"));
    else if (result.ok) toast.success(t("sync.done"));
  });

  if (!setup || editing) {
    return (
      <Card>
        <IconCardHeader icon={Trash2Icon} tone="success" title={setup ? t("setup.changeTitle") : t("setup.title")} description={t("setup.description")} />
        {canManage ? (
          <WasteSetupForm
            providers={settings.providers}
            suggestedProviderId={settings.suggestedProviderId}
            currentProviderId={setup?.providerId}
            defaults={defaults}
            onCancel={setup ? () => setEditing(false) : undefined}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("setup.readOnly")}</p>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <IconCardHeader icon={Trash2Icon} tone="success" title={setup.providerName} description={setup.addressLabel} textClassName="flex min-w-0 flex-col gap-0.5" />

      {setup.lastSyncStatus === "error" ? (
        <InlineAlert tone="error">
          {t("sync.lastFailed", { error: setup.lastSyncError ?? "" })}{" "}
          {setup.lastSuccessAt ? t("sync.keptSince", { date: dateTimeText(setup.lastSuccessAt) }) : t("sync.nothingYet")}
        </InlineAlert>
      ) : (
        <p className="text-sm text-muted-foreground">
          {setup.lastSyncAt ? t("sync.lastSync", { date: dateTimeText(setup.lastSyncAt) }) : t("sync.never")} · {t("sync.daily")}
        </p>
      )}

      <PendingContent pending={syncing} label={t("sync.running")}>
        {settings.upcoming.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{t("upcoming.title")}</h3>
            <WasteDayList days={settings.upcoming} today={today} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("upcoming.empty")}</p>
        )}
      </PendingContent>
      <p className="text-xs text-muted-foreground">{t("upcoming.calendar")}</p>

      <WasteTaskSettings settings={setup.tasks} habitants={habitants} canManage={canManage} />

      {canManage && (
        <CardFooter className="flex-wrap justify-end gap-2 border-t pt-3">
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="mr-auto text-destructive hover:text-destructive">
                <Trash2Icon />
                {t("remove.action")}
              </Button>
            }
            title={t("remove.title")}
            description={t("remove.description")}
            confirmLabel={t("remove.confirm")}
            destructive
            onConfirm={() => remove.submit({ intent: "waste-remove" }, { method: "post" })}
          />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            {t("setup.change")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={syncing}
            onClick={() => void sync.submit({ intent: "waste-sync" }, { method: "post" })}
          >
            <RefreshCwIcon />
            {syncing ? t("sync.running") : t("sync.now")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
