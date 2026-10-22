import { polygonAreaM2, type FloorPlan, type FloorUnderlay, type Point, type Wall } from "@/features/places/types/places";
import { cmPerPointAtScale } from "@/features/places/components/underlay-geometry";
import { groundFloorPlanFixture } from "./fixtures";

/**
 * A synthetic architect's plan for stories: the 10 × 8 m sample ground floor drawn at 1:50 on an A4
 * landscape page, with room labels ("Keuken 16,34 m2", a name over an area), a title, a scale note and a
 * dimension. Generated here, so no real plan (names, addresses, phone numbers) ever ends up in the repo.
 * The same drawing is available as a PDF (for the import dialog) and as an SVG image (the rendered crop).
 */

/** Centimetres per PDF point at 1:50. */
const SCALE = cmPerPointAtScale(50);
const PAGE = { width: 842, height: 595 };
/** Where plan (0, 0) lands on the page, in points from the top-left. */
const ORIGIN = { x: 140, y: 60 };

const toPage = (point: Point) => ({ x: ORIGIN.x + point.x / SCALE, y: ORIGIN.y + point.y / SCALE });

type Primitive =
  | { type: "line"; a: Point; b: Point; width: number }
  | { type: "text"; at: Point; text: string; size: number };

const walls = groundFloorPlanFixture.elements.filter((element): element is Wall => element.kind === "wall");

/** Room labels as an architect writes them; the hall's area is deliberately off to show the warning. */
const LABELS: { name: string; area: string; at: Point }[] = [
  { name: "LIVING", area: "24,94 m2", at: { x: 300, y: 225 } },
  { name: "Keuken", area: "16,34 m2", at: { x: 795, y: 225 } },
  { name: "Inkomhal", area: "11,60 m2", at: { x: 175, y: 620 } },
  { name: "Bureau", area: "", at: { x: 850, y: 560 } },
];

function groundPrimitives(): Primitive[] {
  const primitives: Primitive[] = walls.map((wall) => ({
    type: "line",
    a: toPage(wall.a),
    b: toPage(wall.b),
    width: wall.thickness / SCALE,
  }));
  for (const label of LABELS) {
    const at = toPage(label.at);
    if (label.area) {
      primitives.push({ type: "text", at: { x: at.x - 18, y: at.y - 4 }, text: label.name, size: 9 });
      primitives.push({ type: "text", at: { x: at.x - 18, y: at.y + 8 }, text: label.area, size: 8 });
    } else {
      primitives.push({ type: "text", at, text: `${label.name} 9,95 m2`, size: 8 });
    }
  }
  primitives.push({ type: "text", at: { x: ORIGIN.x, y: ORIGIN.y - 22 }, text: "GELIJKVLOERS - nieuwe toestand", size: 14 });
  primitives.push({ type: "text", at: { x: ORIGIN.x + 220, y: ORIGIN.y - 8 }, text: "1.000", size: 7 });
  primitives.push({ type: "text", at: { x: 40, y: PAGE.height - 30 }, text: "schaal 1/50", size: 9 });
  // The architect's north arrow, next to the drawing and turned like on a real sheet.
  const [tail, tip] = SYNTHETIC_NORTH_ARROW;
  const head = (side: 1 | -1) => {
    const back = (SYNTHETIC_NORTH * Math.PI) / 180 + Math.PI + (side * Math.PI) / 7;
    return { x: tip.x + Math.sin(back) * 9, y: tip.y - Math.cos(back) * 9 };
  };
  primitives.push({ type: "line", a: tail, b: tip, width: 1.2 });
  primitives.push({ type: "line", a: tip, b: head(1), width: 1.2 });
  primitives.push({ type: "line", a: tip, b: head(-1), width: 1.2 });
  primitives.push({ type: "text", at: { x: tip.x + 2, y: tip.y - 4 }, text: "N", size: 9 });
  return primitives;
}

/** On the synthetic sheet north points 30° clockwise from up. */
export const SYNTHETIC_NORTH = 30;
/** Tail and tip of the synthetic north arrow, in points on the page (y down). */
const SYNTHETIC_NORTH_ARROW: [Point, Point] = (() => {
  const tail = { x: 702, y: 532 };
  const length = 40;
  const radians = (SYNTHETIC_NORTH * Math.PI) / 180;
  return [tail, { x: tail.x + Math.sin(radians) * length, y: tail.y - Math.cos(radians) * length }];
})();
/** The same arrow on the plan (cm), where it lands with the aligned underlay (`underlayFixture`). */
export const syntheticNorthArrowOnPlan = SYNTHETIC_NORTH_ARROW.map((point) => ({
  x: (point.x - ORIGIN.x) * SCALE,
  y: (point.y - ORIGIN.y) * SCALE,
})) as [Point, Point];

function secondPagePrimitives(): Primitive[] {
  return [
    { type: "line", a: toPage({ x: 0, y: 0 }), b: toPage({ x: 1000, y: 0 }), width: 30 / SCALE },
    { type: "line", a: toPage({ x: 1000, y: 0 }), b: toPage({ x: 1000, y: 800 }), width: 30 / SCALE },
    { type: "line", a: toPage({ x: 1000, y: 800 }), b: toPage({ x: 0, y: 800 }), width: 30 / SCALE },
    { type: "line", a: toPage({ x: 0, y: 800 }), b: toPage({ x: 0, y: 0 }), width: 30 / SCALE },
    { type: "text", at: { x: ORIGIN.x, y: ORIGIN.y - 22 }, text: "VERDIEPING - nieuwe toestand", size: 14 },
    { type: "text", at: toPage({ x: 420, y: 400 }), text: "Slaapkamer 1 18,20 m2", size: 9 },
  ];
}

const n = (value: number) => value.toFixed(2);

/** A PDF content stream (y up) for the primitives (y down). */
function contentStream(primitives: Primitive[]): string {
  return primitives
    .map((primitive) => {
      if (primitive.type === "line") {
        const { a, b } = primitive;
        return `${n(primitive.width)} w 2 J ${n(a.x)} ${n(PAGE.height - a.y)} m ${n(b.x)} ${n(PAGE.height - b.y)} l S`;
      }
      const text = primitive.text.replace(/[()\\]/g, (char) => `\\${char}`);
      return `BT /F1 ${primitive.size} Tf ${n(primitive.at.x)} ${n(PAGE.height - primitive.at.y)} Td (${text}) Tj ET`;
    })
    .join("\n");
}

/** A minimal valid PDF (Helvetica, one content stream per page, correct xref offsets). ASCII only. */
function buildPdf(pages: string[]): string {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((content, index) => {
    const pageId = pageIds[index]!;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** The synthetic plan as PDF text (also used by the runtime check outside the browser). */
export function syntheticPlanPdfText({ pages = 1 }: { pages?: 1 | 2 } = {}): string {
  const streams = [contentStream(groundPrimitives())];
  if (pages === 2) streams.push(contentStream(secondPagePrimitives()));
  return buildPdf(streams);
}

/** The synthetic plan as a file, like one picked in the import dialog. */
export function syntheticPlanPdf({ pages = 1 }: { pages?: 1 | 2 } = {}): File {
  return new File([syntheticPlanPdfText({ pages })], pages === 2 ? "Synthetic plan (2 pages).pdf" : "Synthetic plan.pdf", {
    type: "application/pdf",
  });
}

/** The crop around the ground floor drawing, in points (y down). */
export const syntheticPlanCrop = { x: 110, y: 30, width: 630, height: 515 };

/** The crop rendered as an image (what the import stores in Documents), as an SVG data URL. */
export const syntheticPlanImageUrl = (() => {
  const { x: left, y: top, width, height } = syntheticPlanCrop;
  const body = groundPrimitives()
    .map((primitive) => {
      if (primitive.type === "line") {
        const { a, b } = primitive;
        return `<line x1="${n(a.x - left)}" y1="${n(a.y - top)}" x2="${n(b.x - left)}" y2="${n(b.y - top)}" stroke="#111" stroke-width="${n(primitive.width)}" stroke-linecap="square" fill="none" opacity="0.35"/>`;
      }
      return `<text x="${n(primitive.at.x - left)}" y="${n(primitive.at.y - top)}" font-family="Helvetica, Arial, sans-serif" font-size="${primitive.size}" fill="#111">${primitive.text}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 4}" height="${height * 4}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

/** Stories: every underlay document id resolves to the synthetic image. */
export const syntheticUnderlayUrl = () => syntheticPlanImageUrl;

/** The labels the import finds in the crop (name over area), relative to the crop. */
const labelsInCrop = LABELS.map((label) => {
  const at = toPage(label.at);
  return {
    name: label.name === "LIVING" ? "Living" : label.name,
    areaM2: label.area ? Number(label.area.replace(" m2", "").replace(",", ".")) : 9.95,
    u: at.x - syntheticPlanCrop.x,
    v: at.y - syntheticPlanCrop.y,
  };
});

/** Where the crop's centre lands on the plan when the underlay lines up with the drawing. */
const alignedCenter = {
  x: (syntheticPlanCrop.x + syntheticPlanCrop.width / 2 - ORIGIN.x) * SCALE,
  y: (syntheticPlanCrop.y + syntheticPlanCrop.height / 2 - ORIGIN.y) * SCALE,
};

/** Imported, calibrated at 1:50 and lined up with the drawn walls. */
export const underlayFixture: FloorUnderlay = {
  sourceFileId: "doc-synthetic-plan",
  imageFileId: "doc-synthetic-plan-image",
  sourceName: "Synthetic plan.pdf",
  sourceMimeType: "application/pdf",
  unit: "pt",
  page: 1,
  crop: syntheticPlanCrop,
  scale: SCALE,
  calibrated: true,
  rotation: 0,
  center: alignedCenter,
  opacity: 0.6,
  visible: true,
  locked: true,
  labels: labelsInCrop,
};

/** Just imported: scale guessed, slightly off and turned, not calibrated yet. */
export const uncalibratedUnderlayFixture: FloorUnderlay = {
  ...underlayFixture,
  scale: SCALE * 1.18,
  calibrated: false,
  rotation: 1.5,
  center: { x: alignedCenter.x + 60, y: alignedCenter.y - 40 },
  locked: false,
};

/** The sample ground floor with the plan under it. */
export const groundFloorWithUnderlayFixture: FloorPlan = { ...groundFloorPlanFixture, underlay: underlayFixture };

/** Walls traced over the plan, no rooms yet: ready for "Fill room". */
export const tracedWallsPlanFixture: FloorPlan = {
  ...groundFloorPlanFixture,
  places: [],
  underlay: underlayFixture,
};

/** Freshly imported, before calibration. */
export const uncalibratedPlanFixture: FloorPlan = {
  ...groundFloorPlanFixture,
  places: [],
  elements: [],
  underlay: uncalibratedUnderlayFixture,
};

/** A synthetic home location (central Brussels) for the sun stories. */
export const storyHomeLocation = { latitude: 50.8503, longitude: 4.3517 };

/** The sample ground floor with north set from the synthetic sheet's arrow (30°) and a home location. */
export const orientedPlanFixture: FloorPlan = { ...groundFloorWithUnderlayFixture, north: SYNTHETIC_NORTH, location: storyHomeLocation };

/** A summer afternoon, so the sun stories show the sun in the south-west. */
export const storySunMoment = new Date(2026, 5, 21, 16, 0);

/** Areas for the fill-room feedback stories. */
export const livingAreaM2 = polygonAreaM2([
  { x: 15, y: 15 },
  { x: 595, y: 15 },
  { x: 595, y: 445 },
  { x: 15, y: 445 },
]);
