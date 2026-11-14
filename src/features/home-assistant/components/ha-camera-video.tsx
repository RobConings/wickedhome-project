import { useEffect, useRef } from "react";

/** Only mounted for a deliberate viewing session. Buffers are discarded on close. */
export function HaCameraVideo({ url, label, onFailure }: { url: string; label: string; onFailure: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    let disposed = false;
    let destroy: (() => void) | undefined;
    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      element.src = url;
      void element.play().catch(() => {});
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (disposed) return;
        if (!Hls.isSupported()) { onFailure(); return; }
        const hls = new Hls({ lowLatencyMode: false, maxBufferLength: 10, backBufferLength: 0 });
        destroy = () => hls.destroy();
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) onFailure(); });
        hls.loadSource(url); hls.attachMedia(element);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { void element.play().catch(() => {}); });
      }).catch(() => { if (!disposed) onFailure(); });
    }
    return () => { disposed = true; destroy?.(); element.pause(); element.removeAttribute("src"); element.load(); };
  }, [url, onFailure]);
  return <video ref={video} className="aspect-video w-full rounded-lg bg-black" aria-label={label} controls autoPlay muted playsInline onError={onFailure} />;
}
