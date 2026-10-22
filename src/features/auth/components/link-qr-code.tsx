import { QrCode } from "./qr-code";

type LinkQrCodeProps = {
  value: string;
  /** Accessible name, e.g. "QR code of the invite link". */
  label: string;
  className?: string;
};

/**
 * The invite/share link as a QR code. Loaded lazily through `ShareLinkPanel`: the encoder (`uqr`) is its
 * own small chunk. Renders the shared `QrCode`.
 */
export function LinkQrCode({ value, label, className }: LinkQrCodeProps) {
  return <QrCode value={value} label={label} className={className} />;
}
