import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { updateDevicePosition } from "../data/devices-requests";
import { useNow } from "@/lib/hooks/use-now";
import type { Device, DevicePositionInput, DevicesOverview } from "../types/devices";
import { DevicePaletteSkeleton } from "./device-palette-skeleton";
import { useDeviceMarkers, useDeviceStates } from "./device-indicator";
import { DevicePalette } from "./device-palette";

type Position = { floorId: string; x: number; y: number } | null;

const EMPTY: DevicesOverview = { devices: [], profiles: [] };

type UseDevicePlanLayerOptions = {
  /** The devices, or a promise of them (a deferred loader value): the plan shows first, devices follow. */
  overview: DevicesOverview | Promise<DevicesOverview>;
  floorId: string;
  /** Adults and owners place devices; children only see them. */
  canManage: boolean;
  /** Saves a position; defaults to the API (stories pass a stub). */
  savePosition?: (id: string, input: DevicePositionInput) => Promise<unknown>;
};

/**
 * Everything the floor plan editor needs to show and place devices, as props for places'
 * `FloorPlanScreen`/`FloorPlanEditor`: markers, selection, `onMarkerMove` and the palette. Positions are
 * saved immediately (not with the plan) and shown optimistically.
 */
export function useDevicePlanLayer({ overview: source, floorId, canManage, savePosition = updateDevicePosition }: UseDevicePlanLayerOptions) {
  const { t } = useTranslation("devices");
  const ready = source instanceof Promise ? null : source;
  const [resolved, setResolved] = React.useState<{ from: Promise<DevicesOverview>; overview: DevicesOverview } | null>(null);
  const [failed, setFailed] = React.useState<Promise<DevicesOverview> | null>(null);
  React.useEffect(() => {
    if (!(source instanceof Promise)) return;
    let current = true;
    source.then(
      (overview) => current && setResolved({ from: source, overview }),
      () => current && setFailed(source),
    );
    return () => {
      current = false;
    };
  }, [source]);
  // After a reload (new promise) keep showing the last devices until the new ones arrive.
  const loading = !ready && !resolved && failed !== source;
  const overview = ready ?? resolved?.overview ?? EMPTY;
  const [saving, setSaving] = React.useState(0);
  const now = useNow();
  const [moved, setMoved] = React.useState<Record<string, Position>>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // Tap-to-place: the device chosen with "Place on plan"; the next tap on the plan puts it there.
  const [placingId, setPlacingId] = React.useState<string | null>(null);

  const devices = React.useMemo(
    () =>
      overview.devices.map((device): Device => {
        if (!(device.id in moved)) return device;
        const position = moved[device.id] ?? null;
        return { ...device, floorId: position?.floorId ?? null, position: position ? { x: position.x, y: position.y } : null };
      }),
    [overview.devices, moved],
  );
  const markers = useDeviceMarkers(devices, overview.profiles, floorId, now);
  const stateOf = useDeviceStates(overview.profiles, now);

  const save = React.useCallback(
    async (id: string, position: Position) => {
      setMoved((current) => ({ ...current, [id]: position }));
      const input: DevicePositionInput = position ?? { floorId: null, x: null, y: null };
      setSaving((count) => count + 1);
      try {
        await savePosition(id, input);
      } catch {
        toast.error(t("placement.failed"));
        setMoved((current) => {
          const { [id]: _failed, ...rest } = current;
          return rest;
        });
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [t, savePosition],
  );

  const onMarkerMove = React.useCallback(
    (id: string, x: number, y: number) => {
      // Placed by a tap: stop placing and select it, so it can be nudged or taken off again.
      if (id === placingId) {
        setPlacingId(null);
        setSelectedId(id);
      }
      void save(id, { floorId, x, y });
    },
    [save, floorId, placingId],
  );
  const onPlacingCancel = React.useCallback(() => setPlacingId(null), []);
  const selected = devices.find((device) => device.id === selectedId && device.floorId === floorId) ?? null;
  const placing = devices.find((device) => device.id === placingId && !device.position) ?? null;
  const placingMarker = React.useMemo(
    () => (canManage && placing ? { id: placing.id, label: placing.name } : null),
    [canManage, placing],
  );

  return {
    markers,
    selectedMarkerId: selected?.id ?? null,
    onMarkerClick: setSelectedId,
    onMarkerMove: canManage ? onMarkerMove : undefined,
    placingMarker,
    onPlacingCancel,
    markerPalette: !canManage ? undefined : loading ? (
      <DevicePaletteSkeleton />
    ) : (
      <DevicePalette
        unplaced={devices.filter((device) => !device.position)}
        profiles={overview.profiles}
        stateOf={stateOf}
        floorId={floorId}
        saving={saving > 0}
        failed={failed === source}
        selected={selected}
        onRemove={(id) => {
          setSelectedId(null);
          void save(id, null);
        }}
        placingId={placing?.id ?? null}
        onPlace={(id) => setPlacingId((current) => (current === id ? null : id))}
      />
    ),
  };
}
