import { RecordLink as Link } from "@/components/shared/record-link";
import type * as React from "react";
import { ActivityIcon, ListChecksIcon, FolderIcon, MapIcon, MapPinIcon, SlidersHorizontalIcon, MapPinOffIcon, PencilIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { RecordImage } from "@/components/shared/record-image";
import { RelatedRecordCards, type RelatedRecordLink } from "@/components/shared/related-record-cards";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PageHeader } from "@/components/shared/page-header";
import { useSamePagePending } from "@/lib/pending";
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
  controls?: React.ReactNode;
  attachments?: React.ReactNode;
  maintenance?: React.ReactNode;
  coverChooser?: React.ReactNode;
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
  controls,
  attachments,
  maintenance,
  coverChooser,
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
        backTo="/devices"
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
            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-center xl:justify-end">
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
      {device.imageUrl && <RecordImage src={device.imageUrl} shape="banner" alt={device.name} fallback={<DeviceIcon icon={profile.icon} className="size-12" />} />}
      <RelatedRecordCards label={t("related.label")} items={([
        ...(controls ? [{ id: "controls", label: t("related.controls"), to: "#device-controls", icon: SlidersHorizontalIcon, accent: "devices" } satisfies RelatedRecordLink] : []),
        { id: "values", label: t("detail.values"), to: "#device-values", icon: ActivityIcon, accent: "devices" },
        ...(device.place ? [{ id: "room", label: device.place.name, to: `/places/${encodeURIComponent(device.place.id)}`, icon: MapPinIcon, accent: "home" } satisfies RelatedRecordLink] : []),
        ...(planFloorId ? [{ id: "plan", label: t("related.plan"), to: `/house?floor=${encodeURIComponent(planFloorId)}&device=${encodeURIComponent(device.id)}`, icon: MapIcon, accent: "home" } satisfies RelatedRecordLink] : []),
        ...(maintenance ? [{ id: "maintenance", label: t("maintenance.title"), to: "#device-maintenance", icon: ListChecksIcon, accent: "tasks" } satisfies RelatedRecordLink] : []),
        ...(attachments ? [{ id: "documents", label: t("related.documents"), to: "#device-documents", icon: FolderIcon, accent: "documents" } satisfies RelatedRecordLink] : []),
        ...(canManage ? [{ id: "sources", label: t("bindings.title"), to: "#device-sources", icon: SlidersHorizontalIcon, accent: "integrations" } satisfies RelatedRecordLink] : []),
      ] satisfies RelatedRecordLink[])} />
      {remove.data?.formError && <InlineAlert tone="error">{remove.data.formError}</InlineAlert>}

      {controls}
      <PageGrid columns="main-sidebar">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle id="device-values" className="scroll-mt-20" tabIndex={-1}>{t("detail.values")}</CardTitle>
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
                <Link to={`/energy/appliances/${encodeURIComponent(device.appliance.id)}`} className="inline-flex items-center gap-1 hover:underline">
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
              <CardTitle id="device-sources" className="scroll-mt-20" tabIndex={-1}>{t("bindings.title")}</CardTitle>
              <CardDescription>{t("bindings.description")}</CardDescription>
            </CardHeader>
            <DeviceBindingsForm key={`${device.profileId}-${profile.fields.length}`} device={device} profile={profile} renderEntityPicker={renderEntityPicker} />
          </Card>
        )}
      </PageGrid>
      {maintenance && <Card id="device-maintenance" className="scroll-mt-20"><CardTitle>{t("maintenance.title")}</CardTitle><CardDescription>{t("maintenance.description")}</CardDescription>{maintenance}</Card>}
      {coverChooser && <Card><CardTitle>{t("related.photo")}</CardTitle>{coverChooser}</Card>}
      {attachments && <section id="device-documents" className="scroll-mt-20" tabIndex={-1} aria-label={t("related.documents")}>{attachments}</section>}
    </PageContainer>
  );
}
