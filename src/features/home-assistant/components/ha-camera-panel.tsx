import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, RefreshCwIcon, SquareIcon, VideoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useLiveEvents } from "@/lib/live-events";
import { fetchCameraImage, fetchDeviceCameras, releaseCameraStream, requestCameraSnapshot, requestCameraStream } from "../data/ha-camera-requests";
import type { HaCamera, HaCameraStream, HaDeviceCameras } from "../types/ha-camera";
import { HaCameraVideo } from "./ha-camera-video";

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
    if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, { once: true });
  });
}

function CameraView({ deviceId, camera, previewImage }: { deviceId: string; camera: HaCamera; previewImage?: string }) {
  const { t } = useTranslation("home-assistant");
  const [image, setImage] = useState(previewImage ?? "");
  const imageVersion = useRef<string | null>(null);
  const objectUrl = useRef<string | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<"image" | "capture" | "stream" | null>(camera.available && previewImage === undefined ? "image" : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<HaCameraStream | null>(null);
  const activeStream = useRef<HaCameraStream | null>(null);
  const stop = useCallback(() => {
    const current = activeStream.current;
    activeStream.current = null; setStream(null);
    if (current) void releaseCameraStream(deviceId, current.sessionId);
  }, [deviceId]);
  const showImage = useCallback((result: { blob: Blob; version: string | null }, signal: AbortSignal) => {
    if (signal.aborted) return null;
    const next = URL.createObjectURL(result.blob);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = next; imageVersion.current = result.version; setImage(next);
    return result.version;
  }, []);
  const loadImage = useCallback(async (signal: AbortSignal) => showImage(await fetchCameraImage(deviceId, camera.entityId, signal), signal), [deviceId, camera.entityId, showImage]);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    if (camera.available && previewImage === undefined) {
      void fetchCameraImage(deviceId, camera.entityId, controller.signal).then((result) => showImage(result, controller.signal)).catch(() => { if (!controller.signal.aborted) setError(t("camera.noImage")); }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    }
    return () => { controller.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); const current = activeStream.current; activeStream.current = null; if (current) void releaseCameraStream(deviceId, current.sessionId); };
  }, [camera.available, camera.entityId, previewImage, showImage, deviceId, t]);
  useEffect(() => {
    if (!stream) return;
    const hide = () => { if (document.hidden) stop(); };
    const timer = window.setTimeout(stop, Math.max(0, new Date(stream.expiresAt).getTime() - Date.now()));
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); };
  }, [stream, stop]);
  const streamFailed = useCallback(() => { setError(t("camera.streamFailed")); stop(); }, [t, stop]);

  const refresh = async () => {
    const signal = lifecycle.current?.signal; if (!signal) return;
    setBusy("image"); setError(null);
    try { await loadImage(signal); } catch { if (!signal.aborted) setError(t("camera.noImage")); }
    finally { if (!signal.aborted) setBusy(null); }
  };
  const capture = async () => {
    const signal = lifecycle.current?.signal; if (!signal) return;
    setBusy("capture"); setError(null); setNotice(t("camera.requesting"));
    const before = imageVersion.current;
    try {
      await requestCameraSnapshot(deviceId, camera.entityId);
      if (signal.aborted) return;
      setNotice(t("camera.waiting"));
      for (let attempt = 0; attempt < 18; attempt++) {
        await pause(5000, signal);
        const version = await loadImage(signal).catch(() => null);
        if (version && version !== before) { setNotice(t(before ? "camera.received" : "camera.receivedUnverified")); return; }
      }
      setNotice(t("camera.delayed"));
    } catch { if (!signal.aborted) { setError(t("camera.captureFailed")); setNotice(null); } }
    finally { if (!signal.aborted) setBusy(null); }
  };
  const watch = async () => {
    setBusy("stream"); setError(null);
    try {
      const next = await requestCameraStream(deviceId, camera.entityId);
      if (lifecycle.current?.signal.aborted) { void releaseCameraStream(deviceId, next.sessionId); return; }
      activeStream.current = next; setStream(next);
    } catch { setError(t("camera.streamFailed")); }
    finally { setBusy(null); }
  };
  return <Stack gap="sm" className="rounded-xl border p-3">
    <Inline gap="sm" align="center" justify="between"><Text weight="medium">{camera.name}</Text><Badge variant="secondary">{t(stream ? "camera.live" : camera.available ? "camera.snapshot" : "camera.offline")}</Badge></Inline>
    {stream ? <HaCameraVideo url={stream.url} label={camera.name} onFailure={streamFailed} /> : image ? <img src={image} alt={t("camera.imageAlt", { name: camera.name })} className="aspect-video w-full rounded-lg bg-black object-contain" /> : <Text size="sm" tone="muted">{t(camera.available ? "camera.noImage" : "camera.offlineHint")}</Text>}
    {image && !stream && <Text size="xs" tone="muted">{t("camera.imageHint")}</Text>}
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    {notice && <Text role="status" size="sm">{notice}</Text>}
    <Inline gap="sm" align="stretch" wrap>
      <Button variant="outline" disabled={!camera.available || Boolean(busy) || previewImage !== undefined} loading={busy === "image"} onClick={() => void refresh()}><RefreshCwIcon />{t("camera.refresh")}</Button>
      {camera.canCapture && <Button disabled={Boolean(busy) || previewImage !== undefined} loading={busy === "capture"} onClick={() => void capture()}><CameraIcon />{t("camera.capture")}</Button>}
      {stream ? <Button variant="outline" onClick={stop}><SquareIcon />{t("camera.stop")}</Button> : camera.canStream && <Button variant="outline" disabled={Boolean(busy) || previewImage !== undefined} loading={busy === "stream"} onClick={() => void watch()}><VideoIcon />{t("camera.watch")}</Button>}
    </Inline>
    <Text size="xs" tone="muted">{t(stream ? "camera.liveHint" : camera.canStream ? "camera.liveAvailable" : "camera.liveUnsupported")}</Text>
  </Stack>;
}

export function HaCameraPanel({ deviceId, initial, previewImage }: { deviceId: string; initial?: HaDeviceCameras; previewImage?: string }) {
  const { t } = useTranslation("home-assistant");
  const resource = useAsyncResource(`ha-cameras:${deviceId}`, () => fetchDeviceCameras(deviceId), { initial });
  useLiveEvents("home_assistant.status", resource.refresh, { enabled: !initial });
  useLiveEvents("device.changed", resource.refresh, { enabled: !initial });
  const data = resource.data;
  if (data?.connected && !data.cameras.length) return null;
  return <Card>
    <CardTitle><CameraIcon className="mr-2 inline size-5 text-section" />{t("camera.title")}</CardTitle>
    <CardDescription>{t("camera.description")}</CardDescription>
    {resource.error ? <InlineAlert tone="error">{t("camera.loadFailed")} <Button variant="outline" onClick={resource.refresh}>{t("controls.retry")}</Button></InlineAlert>
      : data && !data.connected ? <Text size="sm">{t("controls.offline")}</Text>
      : !data ? <Text role="status" size="sm">{t("camera.loading")}</Text>
      : data.cameras.map((camera) => <CameraView key={`${camera.entityId}:${camera.available}`} deviceId={deviceId} camera={camera} previewImage={previewImage} />)}
  </Card>;
}
