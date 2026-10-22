/**
 * Draws public/brand/badge-96.png: the small monochrome icon Android shows in the status bar for a
 * notification (white on transparent; Android uses only the alpha channel). The shapes follow
 * public/brand/logo-mark.svg (house outline, leaf, dot) on its 64-unit grid. No image libraries: a tiny
 * rasteriser with 4×4 supersampling and a hand-written PNG encoder.
 *
 *   npx tsx scripts/make-notification-badge.ts
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 96;
const SCALE = SIZE / 64;
const SAMPLES = 4;

type Point = [number, number];

const distanceToSegment = ([px, py]: Point, [ax, ay]: Point, [bx, by]: Point) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// The house outline (logo-mark: M12 30 30 14.2 … 34 14.2 52 30 v19 a7 7 0 0 1 -7 7 H19 a7 7 0 0 1 -7 -7 z), as a polygon.
const house: Point[] = [[12, 30], [32, 12.5], [52, 30], [52, 52], [48, 56], [16, 56], [12, 52]];
const STROKE = 6;

function covered(x: number, y: number): boolean {
  const p: Point = [x, y];
  // Outline stroke.
  for (let index = 0; index < house.length; index += 1) {
    if (distanceToSegment(p, house[index]!, house[(index + 1) % house.length]!) <= STROKE / 2) return true;
  }
  // The dot (cx 49.5, cy 11, r 5.5).
  if (Math.hypot(x - 49.5, y - 11) <= 5.5) return true;
  // The leaf: an ellipse from (18.5, 51.5) to (43.5, 26), 9 units wide.
  const [ax, ay, bx, by] = [19, 51, 43, 27];
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  const angle = Math.atan2(by - ay, bx - ax);
  const u = (x - cx) * Math.cos(angle) + (y - cy) * Math.sin(angle);
  const v = -(x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle);
  const half = Math.hypot(bx - ax, by - ay) / 2;
  return (u / half) ** 2 + (v / 4.5) ** 2 <= 1;
}

const pixels = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let row = 0; row < SIZE; row += 1) {
  pixels[row * (SIZE * 4 + 1)] = 0; // filter: none
  for (let col = 0; col < SIZE; col += 1) {
    let hits = 0;
    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        if (covered((col + (sx + 0.5) / SAMPLES) / SCALE, (row + (sy + 0.5) / SAMPLES) / SCALE)) hits += 1;
      }
    }
    const offset = row * (SIZE * 4 + 1) + 1 + col * 4;
    pixels.writeUInt32BE((0xffffff00 | Math.round((hits / (SAMPLES * SAMPLES)) * 255)) >>> 0, offset);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Buffer) => {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header.writeUInt8(8, 8); // bit depth
header.writeUInt8(6, 9); // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../public/brand/badge-96.png", import.meta.url), png);
console.log(`public/brand/badge-96.png: ${png.length} bytes`);
