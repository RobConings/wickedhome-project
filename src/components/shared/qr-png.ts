import { encode } from "uqr";

/**
 * A QR code as a PNG (white background, `caption` lines printed under it), for sharing to another app on the
 * same phone, which can't scan its own screen. Null when the browser has no canvas. Load it lazily, like
 * `qr-code.tsx`: the encoder (`uqr`) is its own chunk.
 */
export function qrPngBlob(value: string, { caption = [], ecc = "M" }: { caption?: readonly string[]; ecc?: "L" | "M" | "Q" | "H" } = {}): Promise<Blob | null> {
  const { size, data } = encode(value, { ecc, border: 4 });
  const scale = 10;
  const qrSide = size * scale;
  const lineHeight = 36;
  const width = Math.max(qrSide, 720);
  const height = qrSide + (caption.length > 0 ? caption.length * lineHeight + 32 : 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111";
  const left = Math.round((width - qrSide) / 2);
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect(left + x * scale, y * scale, scale, scale);
    }),
  );
  context.font = "26px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  caption.forEach((line, index) => context.fillText(line, width / 2, qrSide + 16 + (index + 1) * lineHeight - 10, width - 32));
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
