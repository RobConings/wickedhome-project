/**
 * Unit tests for importing an architect's plan: lengths in Belgian notation, scale maths and room labels.
 * Run on the server:
 *
 *   npx tsx --test src/features/places/components/plan-import.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FloorUnderlay } from "../types/places";
import { parsePlanLabels, parseAreaM2, tidyLabelName, type PlanTextItem } from "./plan-labels";
import { parseBelgianNumber, parseLengthCm } from "./plan-length";
import {
  applyDrawingScale,
  calibrateTwoPoint,
  cmPerPointAtScale,
  compareArea,
  drawingRatio,
  normalizeRotation,
  underlayToWorld,
  worldToUnderlay,
} from "./underlay-geometry";

const close = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≉ ${expected}`);

describe("lengths", () => {
  it("reads Belgian numbers", () => {
    assert.equal(parseBelgianNumber("1.200"), 1200);
    assert.equal(parseBelgianNumber("12,65"), 12.65);
    assert.equal(parseBelgianNumber("1.200,5"), 1200.5);
    assert.equal(parseBelgianNumber("12.65"), 12.65);
    assert.equal(parseBelgianNumber("1.200", { dotIsDecimal: true }), 1.2);
    assert.equal(parseBelgianNumber("abc"), null);
    assert.equal(parseBelgianNumber("1,2,3"), null);
  });

  it("reads lengths in cm with or without a unit", () => {
    assert.equal(parseLengthCm("12,00 m"), 1200);
    assert.equal(parseLengthCm("12.5m"), 1250);
    assert.equal(parseLengthCm("1200 cm"), 1200);
    assert.equal(parseLengthCm("1.200"), 1200);
    assert.equal(parseLengthCm("450"), 450);
    assert.equal(parseLengthCm("3,45"), 345);
    assert.equal(parseLengthCm("12000 mm"), 1200);
    assert.equal(parseLengthCm(" 1 200 cm "), 1200);
    assert.equal(parseLengthCm("1.200 m"), 120);
    assert.equal(parseLengthCm(""), null);
    assert.equal(parseLengthCm("0"), null);
    assert.equal(parseLengthCm("twelve"), null);
    assert.equal(parseLengthCm("12 ft"), null);
  });
});

const underlay: FloorUnderlay = {
  sourceFileId: "src",
  imageFileId: "img",
  sourceName: "plan.pdf",
  sourceMimeType: "application/pdf",
  unit: "pt",
  page: 1,
  crop: { x: 100, y: 50, width: 600, height: 400 },
  scale: 2,
  calibrated: false,
  rotation: 0,
  center: { x: 500, y: 300 },
  opacity: 0.5,
  visible: true,
  locked: false,
  labels: [],
};

describe("scale and placement", () => {
  it("converts PDF points at a drawing scale", () => {
    close(cmPerPointAtScale(50), (50 * 2.54) / 72);
    close(drawingRatio(cmPerPointAtScale(100)), 100);
    // 1:50, a 12 m wall is 24 cm on paper = 680,3 pt.
    close(1200 / cmPerPointAtScale(50), (24 / 2.54) * 72);
  });

  it("maps underlay points to the plan and back, also rotated", () => {
    assert.deepEqual(underlayToWorld(underlay, { x: 300, y: 200 }), { x: 500, y: 300 });
    assert.deepEqual(underlayToWorld(underlay, { x: 0, y: 0 }), { x: -100, y: -100 });
    const turned = { ...underlay, rotation: 90 };
    const corner = underlayToWorld(turned, { x: 0, y: 0 });
    // Clockwise on screen: the top-left corner swings to the top right.
    close(corner.x, 500 + 400);
    close(corner.y, 300 - 600);
    const back = worldToUnderlay({ ...underlay, rotation: 33.3 }, underlayToWorld({ ...underlay, rotation: 33.3 }, { x: 123, y: 45 }));
    close(back.x, 123);
    close(back.y, 45);
  });

  it("calibrates from two points, keeping the first one still", () => {
    const a = underlayToWorld(underlay, { x: 100, y: 100 });
    const b = underlayToWorld(underlay, { x: 400, y: 100 });
    // 300 units are really 12 m.
    const calibrated = calibrateTwoPoint(underlay, a, b, 1200);
    assert.ok(calibrated);
    close(calibrated.scale, 4);
    assert.equal(calibrated.calibrated, true);
    const a2 = underlayToWorld(calibrated, { x: 100, y: 100 });
    const b2 = underlayToWorld(calibrated, { x: 400, y: 100 });
    close(a2.x, a.x);
    close(a2.y, a.y);
    close(Math.hypot(b2.x - a2.x, b2.y - a2.y), 1200);
    assert.equal(calibrateTwoPoint(underlay, a, a, 1200), null);
    assert.equal(calibrateTwoPoint(underlay, a, b, 0), null);
  });

  it("applies a drawing scale around an anchor", () => {
    const scaled = applyDrawingScale(underlay, 50);
    close(scaled.scale, cmPerPointAtScale(50));
    assert.deepEqual(scaled.center, underlay.center);
    const anchor = { x: 0, y: 0 };
    const local = worldToUnderlay(underlay, anchor);
    const moved = underlayToWorld(applyDrawingScale(underlay, 100, anchor), local);
    close(moved.x, 0);
    close(moved.y, 0);
  });

  it("normalises rotations", () => {
    assert.equal(normalizeRotation(270), -90);
    assert.equal(normalizeRotation(-180), 180);
    assert.equal(normalizeRotation(450.5), 90.5);
  });

  it("compares drawn and architect areas within 3 %", () => {
    assert.equal(compareArea(17.32, 17.32).matches, true);
    assert.equal(compareArea(17.8, 17.32).matches, true);
    assert.equal(compareArea(18.2, 17.32).matches, false);
  });
});

/** Text item helper: left, top, height; width from the text length. */
const text = (str: string, x: number, y: number, height = 10): PlanTextItem => ({ str, x, y, width: str.length * height * 0.55, height });

describe("room labels", () => {
  it("reads areas in every notation", () => {
    assert.equal(parseAreaM2("12,65 m2"), 12.65);
    assert.equal(parseAreaM2("12.65m²"), 12.65);
    assert.equal(parseAreaM2("8,4 m 2"), 8.4);
    assert.equal(parseAreaM2("Keuken 17,32 m²"), 17.32);
    assert.equal(parseAreaM2("1.200"), null);
    assert.equal(parseAreaM2("GELIJKVLOERS"), null);
  });

  it("tidies names in capitals", () => {
    assert.equal(tidyLabelName("KEUKEN "), "Keuken");
    assert.equal(tidyLabelName("Slaapkamer 2 -"), "Slaapkamer 2");
  });

  it("finds a name and area on one line", () => {
    const labels = parsePlanLabels([text("Keuken 12,65 m2", 100, 100)]);
    assert.equal(labels.length, 1);
    assert.equal(labels[0]?.name, "Keuken");
    assert.equal(labels[0]?.areaM2, 12.65);
  });

  it("joins a name above its area, and a raised 2 after m", () => {
    const labels = parsePlanLabels([
      text("BERGING", 300, 100),
      text("4,20 m", 302, 114),
      { str: "2", x: 302 + 6 * 5.5 + 0.5, y: 111, width: 3, height: 6 },
      text("Living", 100, 100),
      text("32,10 m²", 98, 114),
      text("1.200", 200, 400),
      text("GELIJKVLOERS - nieuwe toestand", 50, 600, 16),
      text("schaal 1/50", 50, 620),
    ]);
    const byName = Object.fromEntries(labels.map((label) => [label.name, label.areaM2]));
    assert.deepEqual(byName, { Berging: 4.2, Living: 32.1 });
  });

  it("keeps an area without a name", () => {
    const labels = parsePlanLabels([text("6,05 m2", 0, 0)]);
    assert.deepEqual(labels.map((label) => [label.name, label.areaM2]), [["", 6.05]]);
  });
});
