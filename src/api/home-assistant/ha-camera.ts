import { createHash } from "node:crypto";
import type { HaCamera, HaCameraStream, HaDeviceCameras } from "@/features/home-assistant/types/ha-camera";
import { getDeviceDetail } from "../devices/devices.service";
import { config } from "../lib/config";
import { HttpError, notFound } from "../lib/http";
import type { HaState } from "./ha-client";
import { connectionStatusFor, getEntityPlatform, getEntityState, requireConnectedClient } from "./ha-connection";
import { cameraStreamRoot, newCameraMediaId, readCameraMedia, rewriteCameraPlaylist } from "./ha-camera-media";

type Services = Record<string, Record<string, unknown>>;

export function describeCamera(state: HaState, platform: string | null, captureService: boolean): HaCamera | null {
  if (!/^camera\.[a-z0-9_]+$/.test(state.entity_id)) return null;
  const available = !["unavailable", "unknown"].includes(state.state);
  const features = typeof state.attributes.supported_features === "number" ? state.attributes.supported_features : 0;
  return { entityId: state.entity_id, name: typeof state.attributes.friendly_name === "string" ? state.attributes.friendly_name : state.entity_id,
    available, canCapture: available && platform === "verisure" && captureService, canStream: available && Boolean(features & 2) };
}

export async function getDeviceCameras(householdId: string, deviceId: string): Promise<HaDeviceCameras> {
  // Existing domain service enforces household ownership before any media is accessed.
  const { device } = await getDeviceDetail(householdId, deviceId);
  const status = await connectionStatusFor(householdId);
  if (!status.linked || status.state !== "connected") return { connected: false, cameras: [] };
  const ids = [...new Set(device.values.flatMap((value) => value.source === "home_assistant" && value.haEntityId?.startsWith("camera.") ? [value.haEntityId] : []))];
  if (!ids.length) return { connected: true, cameras: [] };
  const services = ids.some((id) => getEntityPlatform(id) === "verisure")
    ? await requireConnectedClient().sendCommand<Services>({ type: "get_services" }) : {};
  return { connected: true, cameras: ids.flatMap((id) => {
    const state = getEntityState(id);
    const camera = state ? describeCamera(state, getEntityPlatform(id), Boolean(services.verisure?.capture_smartcam)) : null;
    return camera ? [camera] : [{ entityId: id, name: id, available: false, canCapture: false, canStream: false }];
  }) };
}

async function linkedCamera(householdId: string, deviceId: string, entityId: string) {
  const result = await getDeviceCameras(householdId, deviceId);
  if (!result.connected) throw new HttpError(503, "ha_unavailable", "Home Assistant is not connected");
  const camera = result.cameras.find((row) => row.entityId === entityId);
  if (!camera) throw notFound("Camera is not linked to this device");
  if (!camera.available) throw new HttpError(409, "camera_offline", "This camera is offline");
  return camera;
}

function haUrl(path: string) { return new URL(path, config.HOME_ASSISTANT_URL!); }

export async function getCameraImage(householdId: string, deviceId: string, entityId: string) {
  await linkedCamera(householdId, deviceId, entityId);
  const media = await readCameraMedia(haUrl(`/api/camera_proxy/${encodeURIComponent(entityId)}`), config.HOME_ASSISTANT_TOKEN!);
  if (!["image/jpeg", "image/png", "image/webp"].includes(media.type)) throw new HttpError(502, "camera_unavailable", "The camera did not provide an image");
  return { ...media, version: createHash("sha256").update(media.body).digest("hex") };
}

const captures = new Map<string, number>();
export async function captureCameraImage(householdId: string, deviceId: string, entityId: string) {
  const camera = await linkedCamera(householdId, deviceId, entityId);
  if (!camera.canCapture) throw new HttpError(409, "camera_capture_unsupported", "This camera cannot take a snapshot through its connection");
  const now = Date.now();
  for (const [key, until] of captures) if (until <= now) captures.delete(key);
  const key = `${householdId}:${entityId}`;
  if (captures.has(key)) throw new HttpError(429, "camera_capture_busy", "Wait a minute before taking another snapshot", undefined, 60);
  if (captures.size >= 1000) throw new HttpError(429, "camera_capture_busy", "Too many camera requests");
  captures.set(key, now + 60_000);
  try {
    await requireConnectedClient().sendCommand({ type: "call_service", domain: "verisure", service: "capture_smartcam", target: { entity_id: entityId } }, 45_000);
  } catch {
    throw new HttpError(502, "camera_capture_failed", "The camera could not take a new snapshot");
  }
  // The provider can finish asynchronously or decline in its own logs: never claim a new image exists here.
  return { status: "requested" as const };
}

type Stream = { id: string; householdId: string; userId: string; deviceId: string; entityId: string; expires: number; root: string; assets: Map<string, URL>; ids: Map<string, string> };
const streams = new Map<string, Stream>();
const SESSION_MS = 10 * 60_000;
function pruneStreams() { for (const [id, stream] of streams) if (stream.expires <= Date.now()) streams.delete(id); }
function registerAsset(stream: Stream, url: URL): string {
  let id = stream.ids.get(url.href);
  if (!id) {
    if (stream.assets.size >= 4096) throw new HttpError(409, "camera_stream_expired", "Start a new viewing session");
    id = newCameraMediaId(); stream.assets.set(id, url); stream.ids.set(url.href, id);
  }
  return `/api/home-assistant/devices/${encodeURIComponent(stream.deviceId)}/cameras/streams/${stream.id}/${id}`;
}

export async function startCameraStream(householdId: string, userId: string, deviceId: string, entityId: string): Promise<HaCameraStream> {
  const camera = await linkedCamera(householdId, deviceId, entityId);
  if (!camera.canStream) throw new HttpError(409, "camera_stream_unsupported", "Live video is not available through this camera connection");
  pruneStreams();
  if (streams.size >= 32 || [...streams.values()].filter((row) => row.userId === userId).length >= 4) throw new HttpError(429, "camera_stream_busy", "Close another viewing session first");
  let result: { url: string };
  try { result = await requireConnectedClient().sendCommand({ type: "camera/stream", entity_id: entityId, format: "hls" }); }
  catch { throw new HttpError(502, "camera_stream_unavailable", "The camera could not start live video"); }
  const url = haUrl(result.url);
  const stream: Stream = { id: newCameraMediaId(), householdId, userId, deviceId, entityId, expires: Date.now() + SESSION_MS,
    root: cameraStreamRoot(url, haUrl("/")), assets: new Map(), ids: new Map() };
  const proxy = registerAsset(stream, url); streams.set(stream.id, stream);
  return { sessionId: stream.id, url: proxy, expiresAt: new Date(stream.expires).toISOString() };
}

function viewingSession(householdId: string, userId: string, deviceId: string, id: string) {
  pruneStreams();
  const stream = streams.get(id);
  if (!stream || stream.householdId !== householdId || stream.userId !== userId || stream.deviceId !== deviceId) throw notFound("Viewing session not found");
  return stream;
}

export async function getCameraStreamAsset(householdId: string, userId: string, deviceId: string, sessionId: string, assetId: string, range?: string) {
  const stream = viewingSession(householdId, userId, deviceId, sessionId);
  // Recheck ownership/bindings and availability on every media request, including after a device edit.
  const camera = await linkedCamera(householdId, deviceId, stream.entityId);
  if (!camera.canStream) throw new HttpError(409, "camera_stream_unsupported", "Live video is no longer available");
  const source = stream.assets.get(assetId);
  if (!source) throw notFound("Stream asset not found");
  if (range && !/^bytes=\d+-\d*$/.test(range)) throw new HttpError(400, "bad_request", "Unsupported byte range");
  const media = await readCameraMedia(source, config.HOME_ASSISTANT_TOKEN!, fetch, range);
  if (media.type.includes("mpegurl") || source.pathname.endsWith(".m3u8")) {
    return { ...media, type: "application/vnd.apple.mpegurl", body: Buffer.from(rewriteCameraPlaylist(media.body.toString("utf8"), source, stream.root, (url) => registerAsset(stream, url))), contentRange: null };
  }
  if (!["video/mp2t", "video/mp4", "audio/mp4", "application/octet-stream"].includes(media.type)) throw new HttpError(502, "camera_stream_invalid", "Unsupported camera media");
  return media;
}

export function stopCameraStream(householdId: string, userId: string, deviceId: string, sessionId: string) {
  const stream = viewingSession(householdId, userId, deviceId, sessionId); streams.delete(stream.id);
}
