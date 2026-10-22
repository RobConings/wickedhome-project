import * as React from "react";
import { CpuIcon, HouseIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { useSamePagePending } from "@/lib/pending";
import type { Appliance } from "@/features/energy";
import { NO_PLACE_GROUP, PlaceBadge, placeGroupKey, placeGroupOrder, type Place } from "@/features/places";
import { DeviceFormDialog } from "../components/device-form-dialog";
import { DeviceIcon } from "../components/device-icon";
import { useDeviceStates } from "../components/device-indicator";
import { DeviceRow } from "../components/device-row";
import { DeviceTile } from "../components/device-tile";
import { LiveStatusBadge } from "../components/live-status-badge";
import { useLiveDevices } from "../data/use-live-devices";
import { useNow } from "../data/use-now";
import { DEVICE_CATEGORIES, type Device, type DeviceProfile } from "../types/devices";

type DevicesScreenProps = {
  devices: Device[];
  profiles: DeviceProfile[];
  places: Place[];
  appliances: Appliance[];
  canManage: boolean;
  /** Live updates over Server-Sent Events (off in Storybook). */
  live?: boolean;
  /** Fixed clock for stories and tests. */
  now?: number;
  /** Force the "refreshing" state (stories). */
  pending?: boolean;
};

const ALL = "all";

export function DevicesScreen({ devices: loaded, profiles, places, appliances, canManage, live = true, now: fixedNow, pending: forcedPending }: DevicesScreenProps) {
  const { t } = useTranslation("devices");
  const now = useNow(60_000, fixedNow);
  const devices = useLiveDevices(loaded, { enabled: live });
  const samePagePending = useSamePagePending();
  const pending = forcedPending ?? samePagePending;
  const stateOf = useDeviceStates(profiles, now);
  const [category, setCategory] = React.useState<string>(ALL);
  const [profileId, setProfileId] = React.useState<string>(ALL);

  const profilesById = React.useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const visible = devices.filter((device) => {
    const profile = profilesById.get(device.profileId);
    return (category === ALL || profile?.category === category) && (profileId === ALL || device.profileId === profileId);
  });
  const usedCategories = DEVICE_CATEGORIES.filter((candidate) => profiles.some((profile) => profile.category === candidate));

  const addButton = canManage && profiles.length > 0 && (
    <DeviceFormDialog
      profiles={profiles}
      places={places}
      appliances={appliances}
      trigger={
        <Button>
          <PlusIcon />
          {t("add")}
        </Button>
      }
    />
  );

  const filters = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="group" aria-label={t("filters.label")}>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-full sm:w-48" aria-label={t("filters.category")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allCategories")}</SelectItem>
          {usedCategories.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              {t(`categories.${candidate}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={profileId} onValueChange={setProfileId}>
        <SelectTrigger className="w-full sm:w-56" aria-label={t("filters.profile")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allProfiles")}</SelectItem>
          {profiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              <DeviceIcon icon={profile.icon} />
              {profile.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <PageContainer>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {live && <LiveStatusBadge />}
            <Button asChild variant="outline">
              <Link to="/house">
                <HouseIcon />
                {t("page.liveView")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/devices/profiles">
                <SlidersHorizontalIcon />
                {t("page.profiles")}
              </Link>
            </Button>
            {addButton}
          </div>
        }
      />

      {profiles.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontalIcon}
          title={t("empty.noProfiles.title")}
          description={t("empty.noProfiles.description")}
          action={
            <Button asChild>
              <Link to="/devices/profiles">{t("empty.noProfiles.action")}</Link>
            </Button>
          }
        />
      ) : (
        <GeneralList
          label={t("page.title")}
          items={visible}
          getKey={(device) => device.id}
          renderRow={(device) => (
            <DeviceRow device={device} profile={profilesById.get(device.profileId)} state={stateOf(device)} />
          )}
          renderTile={(device) => (
            <DeviceTile device={device} profile={profilesById.get(device.profileId)} state={stateOf(device)} />
          )}
          search={{
            keys: (device) => [
              device.name,
              profilesById.get(device.profileId)?.name,
              device.place?.name,
              device.place?.floorName,
              device.appliance?.name,
            ],
          }}
          storageKey="devices"
          defaultView="list"
          toolbar={filters}
          filtered={category !== ALL || profileId !== ALL}
          groupBy={(device) => placeGroupKey(device.place)}
          groupOrder={placeGroupOrder(visible.map((device) => device.place))}
          renderGroupHeader={(key, list) => {
            const place = key === NO_PLACE_GROUP ? null : (list[0]?.place ?? null);
            return (
              <span className="flex flex-wrap items-center gap-2">
                {place ? <PlaceBadge place={place} floorName={place.floorName} /> : t("noPlace")}
                <span className="text-sm font-normal text-muted-foreground">{t("count", { count: list.length })}</span>
              </span>
            );
          }}
          pending={pending}
          emptyState={
            <EmptyState icon={CpuIcon} title={t("empty.noDevices.title")} description={t("empty.noDevices.description")} action={addButton} />
          }
        />
      )}
    </PageContainer>
  );
}
