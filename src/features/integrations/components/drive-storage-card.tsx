import * as React from "react";
import { ExternalLinkIcon, FolderOpenIcon, FolderPlusIcon, HardDriveUploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { InlineAlert } from "@/components/shared/inline-alert";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ApiRequestError } from "@/lib/api-client";
import { driveStorageClient, type DriveStorageClient } from "../data/drive-storage-requests";
import {
  missingFeatureForFolderMode,
  type DriveFolderMode,
  type DriveStorageStatus,
  type DriveStorageTarget,
  type DriveStorageUpdateInput,
} from "../types/drive-storage";
import type { GoogleFeature } from "../types/google";
import type { IntegrationStatus } from "../types/integrations";
import { DriveFolderPickerDialog } from "./google-drive-panel";
import { IntegrationCard, IntegrationCardSkeleton } from "./integration-card";

type DriveStorageCardProps = {
  /** From the route's loader: the status, a deferred promise of it (skeleton), or `null` (failed: Retry). */
  data: DriveStorageStatus | null | Promise<DriveStorageStatus | null>;
  /** API access; stories pass a fake. */
  client?: DriveStorageClient;
  /** How often the card checks on a running move (ms). */
  pollMs?: number;
};

/** A move started from this card: how many files were queued, to show "Moving 3 of 12". */
type Batch = { total: number; idlePolls: number };

/** Polls without progress after which the card stops watching (the job keeps retrying on its own). */
const MAX_IDLE_POLLS = 20;

function Deferred({ promise, ...props }: Omit<DriveStorageCardProps, "data"> & { promise: Promise<DriveStorageStatus | null> }) {
  return <DriveStoragePanel initial={React.use(promise)} {...props} />;
}

/**
 * "Bill documents in Google Drive": the household setting that stores files attached to expenses (and PDFs from
 * mail suggestions) in a folder of someone's Drive instead of on the server. Setting it up (new folder, or an
 * existing one with the extra Drive permission), counts, moving existing files with progress, files waiting
 * for Drive, the safety switches, and a clear warning when the Drive's owner disconnected.
 */
export function DriveStorageCard({ data, ...props }: DriveStorageCardProps) {
  const { t } = useTranslation("integrations");
  if (data instanceof Promise) {
    return (
      <React.Suspense fallback={<IntegrationCardSkeleton icon={HardDriveUploadIcon} title={t("driveStorage.title")} />}>
        <Deferred promise={data} {...props} />
      </React.Suspense>
    );
  }
  return <DriveStoragePanel initial={data} {...props} />;
}

const cardStatus = (status: DriveStorageStatus, target: DriveStorageTarget): IntegrationStatus =>
  target.state === "active" ? "connected" : target.state === "paused" ? "error" : status.viewer.googleConfigured ? "disconnected" : "not_configured";

function DriveStoragePanel({ initial, client = driveStorageClient, pollMs = 2000 }: Omit<DriveStorageCardProps, "data"> & { initial: DriveStorageStatus | null }) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const [status, setStatus] = React.useState(initial);
  // New data from the route (revalidated after Google consent, e.g. the extra Drive permission) replaces ours.
  const [fromRoute, setFromRoute] = React.useState(initial);
  if (initial !== fromRoute) {
    setFromRoute(initial);
    setStatus(initial);
  }
  const [reloading, setReloading] = React.useState(false);
  const [batch, setBatch] = React.useState<Batch | null>(null);
  const [changing, setChanging] = React.useState(false);
  const target = status?.targets[0] ?? null;
  const remaining = target ? target.counts.pending + target.counts.failed : 0;

  // While a move started here is running, check on it every couple of seconds.
  React.useEffect(() => {
    if (!batch) return;
    const timer = setTimeout(() => {
      client
        .status()
        .then((next) => {
          const left = next.targets[0] ? next.targets[0].counts.pending + next.targets[0].counts.failed : 0;
          setStatus(next);
          setBatch((current) => {
            if (!current || left === 0) return null;
            const idlePolls = left === remaining ? current.idlePolls + 1 : 0;
            return idlePolls >= MAX_IDLE_POLLS ? null : { ...current, idlePolls };
          });
        })
        .catch(() => setBatch((current) => (current ? { ...current, idlePolls: current.idlePolls + 1 } : null)));
    }, pollMs);
    return () => clearTimeout(timer);
  }, [batch, client, pollMs, remaining]);

  const reload = () => {
    setReloading(true);
    client
      .status()
      .then(setStatus)
      .catch(() => toast.error(tCommon("errors.generic")))
      .finally(() => setReloading(false));
  };

  if (!status || !target) {
    return (
      <IntegrationCard icon={HardDriveUploadIcon} title={t("driveStorage.title")} description={t("driveStorage.description")} status="error">
        <ErrorState
          title={t("driveStorage.loadError")}
          action={
            <Button variant="outline" onClick={reload} loading={reloading}>
              {tCommon("actions.retry")}
            </Button>
          }
          className="py-6"
        />
      </IntegrationCard>
    );
  }

  const { viewer } = status;
  const hasDrive = viewer.connected && viewer.features.includes("drive");
  const connect = (features: GoogleFeature[]) =>
    client
      .start(features)
      .then(({ url }) => window.location.assign(url))
      .catch(() => toast.error(t("google.connectFailed")));

  const statusLabel = target.state === "active" ? t("driveStorage.state.active") : target.state === "paused" ? t("driveStorage.state.paused") : t("driveStorage.state.off");
  const showSetup = target.state === "off" || changing;

  return (
    <IntegrationCard
      icon={HardDriveUploadIcon}
      title={t("driveStorage.title")}
      description={t("driveStorage.description")}
      status={cardStatus(status, target)}
      statusLabel={statusLabel}
      actions={
        target.state !== "off" &&
        viewer.canManage && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                {t("driveStorage.stop")}
              </Button>
            }
            title={t("driveStorage.stopConfirm.title")}
            description={t("driveStorage.stopConfirm.description")}
            confirmLabel={t("driveStorage.stop")}
            onConfirm={() =>
              client
                .disable(target.kind)
                .then((next) => {
                  setStatus(next);
                  setBatch(null);
                  toast.success(t("driveStorage.stopped"));
                })
                .catch(() => toast.error(tCommon("errors.generic")))
            }
          />
        )
      }
    >
      {target.state !== "off" && (
        <ActiveTarget
          target={target}
          status={status}
          client={client}
          batch={batch}
          onStatus={setStatus}
          onBatch={setBatch}
          onConnect={connect}
          onChange={hasDrive ? () => setChanging((value) => !value) : undefined}
          changing={changing}
        />
      )}

      {showSetup &&
        (!viewer.googleConfigured ? (
          <p className="text-sm text-muted-foreground">{t("driveStorage.notConfigured")}</p>
        ) : !hasDrive ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("driveStorage.needsDrive")}</p>
            <ConnectButton label={viewer.connected ? t("driveStorage.turnOnDrive") : t("driveStorage.connectDrive")} onClick={() => connect(["drive"])} />
          </div>
        ) : (
          <SetupForm
            status={status}
            client={client}
            onDone={(next) => {
              setStatus(next);
              setChanging(false);
            }}
            onConnect={connect}
          />
        ))}
    </IntegrationCard>
  );
}

function ConnectButton({ label, onClick }: { label: string; onClick: () => Promise<unknown> }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      className="w-fit"
      loading={busy}
      onClick={() => {
        setBusy(true);
        // Stays busy while the browser leaves for Google; only a failure comes back here.
        onClick().catch(() => setBusy(false));
      }}
    >
      {label}
    </Button>
  );
}

const errorMessage = (error: unknown, fallback: string) => (error instanceof ApiRequestError && error.status < 500 ? error.message : fallback);

// ── Choosing a folder ────────────────────────────────────────────────────────────────────────────────

function SetupForm({
  status,
  client,
  onDone,
  onConnect,
}: {
  status: DriveStorageStatus;
  client: DriveStorageClient;
  onDone: (status: DriveStorageStatus) => void;
  onConnect: (features: GoogleFeature[]) => Promise<unknown>;
}) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const kind = status.targets[0]?.kind ?? "bills";
  const [mode, setMode] = React.useState<DriveFolderMode>("create");
  const [folderName, setFolderName] = React.useState(() => t("driveStorage.defaultFolderName"));
  const [yearSubfolders, setYearSubfolders] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const missing = missingFeatureForFolderMode(mode, status.viewer.features);
  const nameId = React.useId();
  const yearsId = React.useId();

  const save = (input: Parameters<DriveStorageClient["setup"]>[1]) => {
    setSaving(true);
    return client
      .setup(kind, input)
      .then((next) => {
        toast.success(t("driveStorage.saved", { name: next.targets[0]?.folder?.name ?? "" }));
        onDone(next);
      })
      .catch((error: unknown) => {
        toast.error(errorMessage(error, tCommon("errors.generic")));
        throw error;
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-3">
      <SegmentedControl
        label={t("driveStorage.modeLabel")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "create", label: t("driveStorage.mode.create"), icon: FolderPlusIcon },
          { value: "pick", label: t("driveStorage.mode.pick"), icon: FolderOpenIcon },
        ]}
        className="w-full [&>label]:flex-1"
      />

      {mode === "create" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save({ mode: "create", folderName: folderName.trim(), yearSubfolders }).catch(() => undefined);
          }}
        >
          <fieldset disabled={saving} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>{t("driveStorage.folderName")}</Label>
              <Input id={nameId} value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={100} className="text-base sm:text-sm" required />
              <p className="text-xs text-muted-foreground">{t("driveStorage.createHint")}</p>
            </div>
            <YearSwitch id={yearsId} checked={yearSubfolders} onChange={setYearSubfolders} />
          </fieldset>
          <Button type="submit" className="w-fit" loading={saving} disabled={!folderName.trim()}>
            {t("driveStorage.createAndUse")}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("driveStorage.pickHint")}</p>
          {missing ? (
            <>
              <InlineAlert>{t("driveStorage.pickScope")}</InlineAlert>
              <ConnectButton label={t("driveStorage.allowFullDrive")} onClick={() => onConnect([missing])} />
            </>
          ) : (
            <>
              <YearSwitch id={yearsId} checked={yearSubfolders} onChange={setYearSubfolders} disabled={saving} />
              <DriveFolderPickerDialog
                client={client}
                pick={{
                  title: t("driveStorage.pickTitle"),
                  description: t("driveStorage.pickDescription"),
                  confirmLabel: (name) => t("driveStorage.useThis", { name }),
                  openLabel: t("driveStorage.openAFolder"),
                  onPick: (folder) => save({ mode: "pick", driveFolderId: folder.id, yearSubfolders }),
                }}
                trigger={
                  <Button size="sm" className="w-fit" loading={saving}>
                    <FolderOpenIcon />
                    {t("driveStorage.chooseFolder")}
                  </Button>
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function YearSwitch({ id, checked, onChange, disabled }: { id: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { t } = useTranslation("integrations");
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
        <span className="text-sm font-medium">{t("driveStorage.yearSubfolders")}</span>
        <span className="text-xs text-muted-foreground">{t("driveStorage.yearSubfoldersHint", { year: new Date().getFullYear() })}</span>
      </Label>
    </div>
  );
}

// ── Set up: where, counts, moving, waiting files, switches ───────────────────────────────────────────

function ActiveTarget({
  target,
  status,
  client,
  batch,
  onStatus,
  onBatch,
  onConnect,
  onChange,
  changing,
}: {
  target: DriveStorageTarget;
  status: DriveStorageStatus;
  client: DriveStorageClient;
  batch: Batch | null;
  onStatus: (status: DriveStorageStatus) => void;
  onBatch: (batch: Batch | null) => void;
  onConnect: (features: GoogleFeature[]) => Promise<unknown>;
  onChange?: () => void;
  changing: boolean;
}) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const [starting, setStarting] = React.useState(false);
  const [saving, setSaving] = React.useState<keyof DriveStorageUpdateInput | null>(null);
  const owner = target.owner;
  const ownerName = owner?.name ?? "";
  const { counts } = target;
  const waiting = counts.pending + counts.failed;
  const deleteId = React.useId();
  const yearsId = React.useId();

  const moveExisting = () => {
    setStarting(true);
    client
      .moveExisting(target.kind)
      .then(({ queued }) => {
        if (queued === 0) return;
        onBatch({ total: queued, idlePolls: 0 });
        // Show the queued files as waiting right away; the next poll brings real numbers.
        onStatus({ ...status, targets: status.targets.map((entry) => (entry.kind === target.kind ? { ...entry, counts: { ...entry.counts, local: 0, pending: entry.counts.pending + entry.counts.local } } : entry)) });
      })
      .catch((error: unknown) => toast.error(errorMessage(error, tCommon("errors.generic"))))
      .finally(() => setStarting(false));
  };

  const update = (input: DriveStorageUpdateInput) => {
    const field = Object.keys(input)[0] as keyof DriveStorageUpdateInput;
    setSaving(field);
    client
      .update(target.kind, input)
      .then(onStatus)
      .catch(() => toast.error(tCommon("errors.generic")))
      .finally(() => setSaving(null));
  };

  const ownerFeatures: GoogleFeature[] = target.folder?.mode === "pick" ? ["drive", "drive_full"] : ["drive"];
  const done = batch ? Math.max(0, batch.total - waiting) : 0;

  return (
    <div className="flex flex-col gap-3">
      {target.state === "paused" && target.pausedReason === "disconnected" && (
        <InlineAlert tone="error">
          <span className="flex flex-col gap-2">
            <span>{t("driveStorage.paused.disconnected", { name: ownerName, count: counts.inDrive })}</span>
            {owner?.mine && <ConnectButton label={t("driveStorage.connectAgain")} onClick={() => onConnect(ownerFeatures)} />}
          </span>
        </InlineAlert>
      )}
      {target.state === "paused" && target.pausedReason === "needs_reconnect" && (
        <InlineAlert tone="error">
          <span className="flex flex-col gap-2">
            <span>{t("driveStorage.paused.needsReconnect", { name: ownerName })}</span>
            {owner?.mine && <ConnectButton label={t("google.reconnect")} onClick={() => onConnect(ownerFeatures)} />}
          </span>
        </InlineAlert>
      )}
      {target.state === "paused" && target.pausedReason === "missing_scope" && (
        <InlineAlert tone="error">
          <span className="flex flex-col gap-2">
            <span>{t("driveStorage.paused.missingScope", { name: ownerName })}</span>
            {owner?.mine && <ConnectButton label={t("driveStorage.allowFullDrive")} onClick={() => onConnect(["drive_full"])} />}
          </span>
        </InlineAlert>
      )}

      {target.folder && (
        <div className="flex flex-col gap-1 text-sm">
          <span>
            {owner?.mine ? t("driveStorage.whereMine") : t("driveStorage.whereOther", { name: ownerName })}{" "}
            <a href={target.folder.webUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
              {target.folder.name}
              <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
            </a>
          </span>
          {owner?.email && <span className="text-xs text-muted-foreground">{owner.email}</span>}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t("driveStorage.counts.inDrive", { count: counts.inDrive })} · {t("driveStorage.counts.local", { count: counts.local })}
      </p>

      {batch ? (
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <Progress value={(done / batch.total) * 100} label={t("driveStorage.moving", { done, total: batch.total })} />
          <span className="text-xs text-muted-foreground">{t("driveStorage.moving", { done, total: batch.total })}</span>
        </div>
      ) : (
        waiting > 0 && (
          <InlineAlert>
            <span className="flex flex-col gap-1">
              <span>{t("driveStorage.waiting", { count: waiting })}</span>
              {counts.failed > 0 && <span className="text-xs">{t("driveStorage.failed", { count: counts.failed })}</span>}
              {target.lastError && <span className="text-xs text-muted-foreground">{t("driveStorage.lastError", { error: target.lastError })}</span>}
            </span>
          </InlineAlert>
        )
      )}

      <div className="flex flex-wrap gap-2">
        {target.state === "active" && (counts.local > 0 || waiting > 0) && !batch && (
          <Button size="sm" variant="outline" onClick={moveExisting} loading={starting}>
            <HardDriveUploadIcon />
            {counts.local > 0 ? t("driveStorage.moveExisting", { count: counts.local }) : t("driveStorage.retryNow")}
          </Button>
        )}
        {onChange && (
          <Button size="sm" variant="ghost" onClick={onChange}>
            {changing ? tCommon("actions.cancel") : owner?.mine ? t("driveStorage.changeFolder") : t("driveStorage.useMyDrive")}
          </Button>
        )}
      </div>
      {target.state === "active" && counts.local > 0 && !batch && <p className="text-xs text-muted-foreground">{t("driveStorage.moveHint")}</p>}

      <div className="flex flex-col gap-3 border-t pt-3">
        <YearSwitch id={yearsId} checked={target.yearSubfolders} onChange={(value) => update({ yearSubfolders: value })} disabled={saving !== null} />
        <div className="flex items-start gap-3">
          <Switch id={deleteId} checked={target.deleteInDrive} onCheckedChange={(value) => update({ deleteInDrive: value })} disabled={saving !== null} className="mt-0.5" />
          <Label htmlFor={deleteId} className="flex flex-col items-start gap-0.5 font-normal">
            <span className="text-sm font-medium">{t("driveStorage.deleteInDrive")}</span>
            <span className="text-xs text-muted-foreground">{t("driveStorage.deleteInDriveHint")}</span>
          </Label>
        </div>
      </div>
    </div>
  );
}
