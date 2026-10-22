import * as React from "react";
import { CameraIcon, CameraOffIcon, KeyboardIcon, ScanLineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** What the scanner looks for by default: product barcodes and QR codes. */
const DEFAULT_BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"] as const;

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string; format: string }[]> };

type NativeBarcodeDetector = {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/**
 * The browser's own BarcodeDetector where it exists (Chrome on Android), otherwise the ZXing WebAssembly
 * ponyfill, loaded on demand and served from our own origin.
 */
async function createDetector(formats: readonly string[]): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const wanted = formats.filter((format) => supported.includes(format));
      if (wanted.length > 0) return new Native({ formats: wanted });
    } catch {
      // Fall through to the ponyfill.
    }
  }
  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  });
  return new BarcodeDetector({ formats: [...formats] as never }) as unknown as Detector;
}

type Status = "idle" | "starting" | "scanning" | "denied" | "unavailable" | "insecure" | "error";

type BarcodeScannerProps = {
  /** Called once per scanned code (the same code again only after a short pause). */
  onDetect: (code: string, format: string) => void;
  formats?: readonly string[];
  /** Pause detection (e.g. while a dialog about the last scan is open). The camera keeps running. */
  paused?: boolean;
  /** Offer a field to type the code (for desktops, damaged labels, or no camera). */
  allowManualEntry?: boolean;
  /** The last code is being handled (e.g. looked up): the typed-code button spins and the field waits. */
  busy?: boolean;
  className?: string;
};

const SCAN_INTERVAL_MS = 200;
const REPEAT_AFTER_MS = 2500;

/**
 * Scan barcodes and QR codes with the device camera. Uses the rear camera, needs HTTPS (browsers only
 * allow the camera on secure origins), and falls back to typing the code.
 */
export function BarcodeScanner({
  onDetect,
  formats = DEFAULT_BARCODE_FORMATS,
  paused = false,
  allowManualEntry = true,
  busy = false,
  className,
}: BarcodeScannerProps) {
  const { t } = useTranslation();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const last = React.useRef<{ code: string; at: number } | null>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  const [manual, setManual] = React.useState("");
  const [flash, setFlash] = React.useState(false);

  const latest = React.useRef({ onDetect, paused });
  React.useEffect(() => {
    latest.current = { onDetect, paused };
  });

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const formatsKey = formats.join(",");

  const start = React.useCallback(async () => {
    if (!window.isSecureContext) return setStatus("insecure");
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("unavailable");
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const detector = await createDetector(formatsKey.split(","));
      setStatus("scanning");

      const tick = async () => {
        if (streamRef.current !== stream) return;
        if (!latest.current.paused && video.readyState >= 2) {
          try {
            const [result] = await detector.detect(video);
            const now = Date.now();
            if (result?.rawValue && !(last.current?.code === result.rawValue && now - last.current.at < REPEAT_AFTER_MS)) {
              last.current = { code: result.rawValue, at: now };
              setFlash(true);
              window.setTimeout(() => setFlash(false), 300);
              navigator.vibrate?.(60);
              latest.current.onDetect(result.rawValue, result.format);
            }
          } catch {
            // A frame that can't be read; try the next one.
          }
        }
        window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      };
      void tick();
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const name = (error as DOMException | undefined)?.name;
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "unavailable" : "error");
    }
  }, [formatsKey]);

  // Release the camera when the scanner goes away.
  React.useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const code = manual.trim();
    if (!code || busy) return;
    setManual("");
    onDetect(code, "manual");
  }

  const message: Partial<Record<Status, string>> = {
    denied: t("scanner.denied"),
    unavailable: t("scanner.unavailable"),
    insecure: t("scanner.insecure"),
    error: t("scanner.error"),
  };
  const running = status === "scanning" || status === "starting";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-muted">
        <video ref={videoRef} muted playsInline className={cn("size-full object-cover", !running && "invisible")} />
        {running && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
            <div
              className={cn(
                "h-2/5 w-3/4 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)] transition-colors",
                flash && "border-primary bg-primary/20",
              )}
            />
          </div>
        )}
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-section-soft text-section">
              {message[status] ? <CameraOffIcon className="size-6" aria-hidden="true" /> : <ScanLineIcon className="size-6" aria-hidden="true" />}
            </span>
            {message[status] && <p className="max-w-xs text-sm text-muted-foreground">{message[status]}</p>}
            {status !== "insecure" && status !== "unavailable" && (
              <Button type="button" onClick={() => void start()}>
                <CameraIcon />
                {t("scanner.start")}
              </Button>
            )}
          </div>
        )}
        {status === "starting" && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white drop-shadow">
            <Spinner className="size-6" />
            <span>{t("scanner.starting")}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {running && (
          <Button type="button" variant="outline" size="sm" onClick={stop}>
            <CameraOffIcon />
            {t("scanner.stop")}
          </Button>
        )}
        {running && <p className="text-sm text-muted-foreground">{t("scanner.hint")}</p>}
      </div>

      {allowManualEntry && (
        <form onSubmit={submitManual} className="flex gap-2">
          <div className="relative flex-1">
            <KeyboardIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder={t("scanner.manualPlaceholder")}
              aria-label={t("scanner.manualLabel")}
              inputMode="numeric"
              autoComplete="off"
              readOnly={busy}
              className="pl-9 tabular-nums"
            />
          </div>
          <Button type="submit" variant="outline" loading={busy} disabled={!manual.trim()}>
            {t("scanner.manualSubmit")}
          </Button>
        </form>
      )}
    </div>
  );
}
