import type * as React from "react";
import { ArrowLeftIcon, MapIcon, MapPinOffIcon, PencilIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { PageGrid } from "../components/page-grid";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/card";
import { ConfirmDialog } from "../components/confirm-dialog";
import { DescriptionItem, DescriptionList } from "../components/description-list";
import { InlineAlert } from "../components/inline-alert";
import { PageHeader } from "../components/page-header";
import { useSamePagePending } from "../lib/pending";
import type { Appliance } from "@/features/energy";
import { PlaceBadge, type Place } from "@/features/places";
import { DeviceBindingsForm, type DeviceEntityPickerProps } from "../components/device-bindings-form";
import { DeviceFormDialog } from "../components/device-form-dialog";
import { DeviceIcon } from "../components/device-icon";
import { useDeviceStates } from "../components/device-indicator";
import { DeviceStateChip } from "../components/device-state-chip";
import { DeviceValuesList } from "../components/device-values-list";
import { LiveStatusBadge } from "../components/live-status-badge";
import type { DevicesActionResult } from "../data/devices-loaders";
import { useLiveDevices } from "../data/use-live-devices";
import { useNow } from "../data/use-now";
import type { Device, DeviceProfile } from "../types/devices";

type DeviceDetailScreenProps = {
  device: Device;
  profile: DeviceProfile;
  /** Every profile, to switch this device to another one. */
  profiles: DeviceProfile[];
  places: Place[];
  appliances: Appliance[];
  canManage: boolean;
  /** "Browse…" per field in the value sources form, composed by the route (Home Assistant). */
  renderEntityPicker?: (props: DeviceEntityPickerProps) => React.ReactNode;
  /** Extra header actions for everyone, composed by the route (the notifications feature's "Notify me"). */
  headerActions?: React.ReactNode;
  live?: boolean;
  now?: number;
};

/** One device: its state, values (set manual ones), value sources, place and plan position. */
export function DeviceDetailScreen({
  device: loaded,
  profile,
  profiles,
  places,
  appliances,
  canManage,
  renderEntityPicker,
  headerActions,
  live = true,
  now: fixedNow,
}: DeviceDetailScreenProps) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation();
  const now = useNow(60_000, fixedNow);
  const [device = loaded] = useLiveDevices([loaded], { enabled: live });
  const state = useDeviceStates([profile], now)(device);
  const remove = useFetcher<DevicesActionResult>({ key: `device-delete-${device.id}` });
  const position = useFetcher<DevicesActionResult>({ key: `device-position-${device.id}` });
  const planFloorId = device.floorId ?? device.place?.floorId;
  const refreshing = useSamePagePending();

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link to="/devices" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("page.title")}
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
              <DeviceIcon icon={profile.icon} className="size-5" />
            </span>
            {device.name}
          </span>
        }
        description={profile.name}
        actions={
          (canManage || headerActions) && (
            <div className="flex flex-wrap gap-2">
              {headerActions}
              {canManage && (
                <>
                  <DeviceFormDialog
                    device={device}
                    profiles={profiles}
                    places={places}
                    appliances={appliances}
                    trigger={
                      <Button variant="outline">
                        <PencilIcon />
                        {tCommon("actions.edit")}
                      </Button>
                    }
                  />
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline">
                        <Trash2Icon />
                        {tCommon("actions.delete")}
                      </Button>
                    }
                    title={t("delete.title", { name: device.name })}
                    description={t("delete.description")}
                    confirmLabel={tCommon("actions.delete")}
                    cancelLabel={tCommon("actions.cancel")}
                    destructive
                    onConfirm={() => remove.submit({ intent: "delete", id: device.id, redirectTo: "/devices" }, { method: "post" })}
                  />
                </>
              )}
            </div>
          )
        }
      />
      {remove.data?.formError && <InlineAlert tone="error">{remove.data.formError}</InlineAlert>}

      <PageGrid columns="main-sidebar">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{t("detail.values")}</CardTitle>
              <span className="flex flex-wrap items-center gap-2">
                {live && <LiveStatusBadge refreshing={refreshing} />}
                {state && <DeviceStateChip state={state} />}
              </span>
            </div>
            <CardDescription>{canManage ? t("detail.valuesHint") : t("detail.valuesReadOnly")}</CardDescription>
          </CardHeader>
          <DeviceValuesList device={device} profile={profile} canSetValues={canManage} now={now} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("detail.location")}</CardTitle>
          </CardHeader>
          <DescriptionList className="sm:grid-cols-1">
            <DescriptionItem label={t("fields.place")}>{device.place ? <PlaceBadge place={device.place} floorName={device.place.floorName} /> : t("noPlace")}</DescriptionItem>
            <DescriptionItem label={t("detail.plan")}>{device.position ? t("placement.placed") : t("placement.notPlaced")}</DescriptionItem>
            <DescriptionItem label={t("fields.appliance")}>
              {device.appliance ? (
                <Link to="/energy/appliances" className="inline-flex items-center gap-1 hover:underline">
                  <ZapIcon className="size-3.5" aria-hidden="true" />
                  {device.appliance.name}
                </Link>
              ) : (
                "—"
              )}
            </DescriptionItem>
            {device.notes && (
              <DescriptionItem label={t("fields.notes")} wide>
                <span className="whitespace-pre-line">{device.notes}</span>
              </DescriptionItem>
            )}
          </DescriptionList>
          <div className="flex flex-wrap gap-2">
            {planFloorId && (
              <Button asChild size="sm" variant="outline">
                <Link to={`/places/floors/${planFloorId}/plan`}>
                  <MapIcon />
                  {device.position ? t("placement.moveOnPlan") : t("placement.placeOnPlan")}
                </Link>
              </Button>
            )}
            {canManage && device.position && (
              <Button
                size="sm"
                variant="ghost"
                loading={position.state !== "idle"}
                onClick={() => void position.submit({ intent: "set-position", deviceId: device.id, position: { floorId: null, x: null, y: null } }, { method: "post", encType: "application/json" })}
              >
                <MapPinOffIcon />
                {t("placement.remove")}
              </Button>
            )}
          </div>
        </Card>

        {canManage && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("bindings.title")}</CardTitle>
              <CardDescription>{t("bindings.description")}</CardDescription>
            </CardHeader>
            <DeviceBindingsForm key={`${device.profileId}-${profile.fields.length}`} device={device} profile={profile} renderEntityPicker={renderEntityPicker} />
          </Card>
        )}
      </PageGrid>
    </PageContainer>
  );
}
