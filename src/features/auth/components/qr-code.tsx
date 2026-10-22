import { encode } from "uqr";
import { cn } from "@/lib/utils";

type QrCodeProps = {
  value: string;
  /** Accessible name, e.g. "QR code of the invite link". */
  label: string;
  /** Error correction level; "M" by default. */
  ecc?: "L" | "M" | "Q" | "H";
  className?: string;
};

/**
 * A QR code as a crisp SVG (dark modules on a white tile, so phones scan it in dark mode too). Load it
 * lazily (`React.lazy(() => import("./qr-code"))`): the encoder (`uqr`) is its own chunk.
 */
export function QrCode({ value, label, ecc = "M", className }: QrCodeProps) {
  const { size, data } = encode(value, { ecc, border: 2 });
  let path = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn("rounded-lg bg-white", className)}
    >
      <path d={path} fill="#111" />
    </svg>
  );
}
