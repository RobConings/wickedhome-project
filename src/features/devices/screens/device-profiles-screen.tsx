import { ArrowLeftIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { useSamePagePending } from "@/lib/pending";
import { PresetCard } from "../components/preset-card";
import { ProfileCard } from "../components/profile-card";
import type { DevicePresetSummary, DeviceProfile } from "../types/devices";

type DeviceProfilesScreenProps = {
  profiles: DeviceProfile[];
  presets: DevicePresetSummary[];
  canManage: boolean;
};

/** One entry of the list: a profile of the household or a ready-made preset. */
type ProfileEntry = { kind: "profile"; profile: DeviceProfile } | { kind: "preset"; preset: DevicePresetSummary };

const MINE_GROUP = "mine";
const PRESETS_GROUP = "presets";
const GROUP_ORDER = [MINE_GROUP, PRESETS_GROUP];

/** Device types of the household, and ready-made presets to start from. */
export function DeviceProfilesScreen({ profiles, presets, canManage }: DeviceProfilesScreenProps) {
  const { t } = useTranslation("devices");
  const pending = useSamePagePending();
  const newButton = canManage && (
    <Button asChild>
      <Link to="/devices/profiles/new">
        <PlusIcon />
        {t("profiles.new")}
      </Link>
    </Button>
  );

  const entries: ProfileEntry[] = [
    ...profiles.map((profile): ProfileEntry => ({ kind: "profile", profile })),
    ...presets.map((preset): ProfileEntry => ({ kind: "preset", preset })),
  ];
  const noProfiles = (
    <EmptyState icon={SlidersHorizontalIcon} title={t("profiles.empty.title")} description={t("profiles.empty.description")} action={newButton} />
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link to="/devices" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("page.title")}
          </Link>
        }
        title={t("profiles.title")}
        description={t("profiles.description")}
        actions={newButton}
      />

      {/* Without own profiles the presets are the way to start: say so above them. */}
      {profiles.length === 0 && presets.length > 0 && noProfiles}

      <GeneralList
        label={t("profiles.title")}
        items={entries}
        getKey={(entry) => (entry.kind === "profile" ? `profile-${entry.profile.id}` : `preset-${entry.preset.key}`)}
        renderRow={(entry) =>
          entry.kind === "profile" ? (
            <ProfileCard profile={entry.profile} variant="row" />
          ) : (
            <PresetCard preset={entry.preset} canManage={canManage} variant="row" />
          )
        }
        renderTile={(entry) =>
          entry.kind === "profile" ? (
            <ProfileCard profile={entry.profile} />
          ) : (
            <PresetCard preset={entry.preset} canManage={canManage} />
          )
        }
        search={{
          keys: (entry) =>
            entry.kind === "profile"
              ? [entry.profile.name, t(`categories.${entry.profile.category}`)]
              : [entry.preset.name, entry.preset.description, t(`categories.${entry.preset.category}`)],
        }}
        storageKey="device-profiles"
        defaultView="tiles"
        groupBy={(entry) => (entry.kind === "profile" ? MINE_GROUP : PRESETS_GROUP)}
        groupOrder={GROUP_ORDER}
        renderGroupHeader={(key, list) =>
          key === MINE_GROUP ? (
            <span className="flex items-center gap-2">
              {t("profiles.mine")}
              <span className="text-sm font-normal text-muted-foreground">{list.length}</span>
            </span>
          ) : (
            <span className="flex flex-col gap-0.5">
              {t("presets.title")}
              <span className="text-sm font-normal tracking-normal text-muted-foreground">{t("presets.description")}</span>
            </span>
          )
        }
        pending={pending}
        emptyState={noProfiles}
      />
    </PageContainer>
  );
}
