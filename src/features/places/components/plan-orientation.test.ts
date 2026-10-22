/**
 * Unit tests for plan orientation: angles, north from the architect's arrow (with the underlay's rotation)
 * and the crop step's quarter turns. Run on the server:
 *
 *   npx tsx --test src/features/places/components/plan-orientation.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  angleFromPoints,
  compassPoint,
  northFromArrow,
  northFromTopFacing,
  normalizeDegrees,
  pageRectToPreview,
  pageToPreview,
  previewRectToPage,
  previewToPage,
  quarterTurn,
  rotatePoint,
  screenAngle,
  topFacing,
} from "./plan-orientation";
import { underlayToWorld } from "./underlay-geometry";

const close = (actual: number, expected: number, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≉ ${expected}`);

describe("angles", () => {
  it("normalises to [0, 360) with 0,1° steps", () => {
    assert.equal(normalizeDegrees(-90), 270);
    assert.equal(normalizeDegrees(360), 0);
    assert.equal(normalizeDegrees(725), 5);
    assert.equal(normalizeDegrees(359.97), 0);
    assert.equal(normalizeDegrees(12.345), 12.3);
    assert.equal(normalizeDegrees(Number.NaN), 0);
  });

  it("measures a direction clockwise from up (y down)", () => {
    const o = { x: 0, y: 0 };
    assert.equal(angleFromPoints(o, { x: 0, y: -10 }), 0);
    assert.equal(angleFromPoints(o, { x: 10, y: 0 }), 90);
    assert.equal(angleFromPoints(o, { x: 0, y: 10 }), 180);
    assert.equal(angleFromPoints(o, { x: -10, y: 0 }), 270);
    assert.equal(angleFromPoints(o, { x: 5, y: -5 }), 45);
    assert.equal(angleFromPoints(o, o), null);
  });

  it("turns between north on the plan and the direction the plan's top faces", () => {
    assert.equal(topFacing(0), 0);
    assert.equal(topFacing(90), 270); // north to the right: the top faces west
    assert.equal(topFacing(315), 45); // north up-left: the top faces north-east
    for (const north of [0, 12.5, 90, 200, 359]) assert.equal(northFromTopFacing(topFacing(north)), north);
  });

  it("names the nearest compass point", () => {
    assert.equal(compassPoint(0), "n");
    assert.equal(compassPoint(22), "n");
    assert.equal(compassPoint(23), "ne");
    assert.equal(compassPoint(180), "s");
    assert.equal(compassPoint(350), "n");
    assert.equal(compassPoint(-90), "w");
  });

  it("places a compass direction on screen with the plan's north and the view's turn", () => {
    assert.equal(screenAngle(0, 90), 90);
    assert.equal(screenAngle(30, 90), 120);
    // "North up": the view turns by −north, so north points up and east to the right.
    assert.equal(screenAngle(30, 0, -30), 0);
    assert.equal(screenAngle(30, 90, -30), 90);
  });

  it("rotates points clockwise on screen", () => {
    const p = rotatePoint({ x: 1, y: 0 }, 90);
    close(p.x, 0);
    close(p.y, 1);
  });
});

describe("north from the architect's arrow", () => {
  const base = { crop: { x: 0, y: 0, width: 800, height: 600 }, scale: 1.764, center: { x: 500, y: 400 } };

  it("takes the clicked direction when there is no underlay", () => {
    assert.equal(northFromArrow(null, { x: 0, y: 0 }, { x: 10, y: -10 }), 45);
  });

  it("reads the arrow on the sheet and adds the underlay's rotation", () => {
    for (const rotation of [0, 30, 90, -45, 181.5]) {
      const underlay = { ...base, rotation };
      // On the sheet the arrow points straight up (tail below the tip)…
      const tail = underlayToWorld(underlay, { x: 100, y: 200 });
      const tip = underlayToWorld(underlay, { x: 100, y: 150 });
      // …so on the plan north is wherever the underlay turned "up" to.
      close(northFromArrow(underlay, tail, tip)!, normalizeDegrees(rotation), 0.11);
      // The same as the direction of the clicks on the plan.
      close(northFromArrow(underlay, tail, tip)!, angleFromPoints(tail, tip)!, 0.11);
    }
  });

  it("handles an arrow that is itself drawn at an angle on the sheet", () => {
    const underlay = { ...base, rotation: 90 };
    const tail = underlayToWorld(underlay, { x: 0, y: 0 });
    const tip = underlayToWorld(underlay, { x: 10, y: -10 }); // 45° on the sheet
    assert.equal(northFromArrow(underlay, tail, tip), 135);
    assert.equal(northFromArrow(underlay, tail, tail), null);
  });
});

describe("quarter turns in the crop step", () => {
  it("rounds rotations to 0, 90, 180 or 270", () => {
    assert.equal(quarterTurn(0), 0);
    assert.equal(quarterTurn(-90), 270);
    assert.equal(quarterTurn(359), 0);
    assert.equal(quarterTurn(44), 0);
    assert.equal(quarterTurn(96.5), 90);
    assert.equal(quarterTurn(-185), 180);
    assert.equal(quarterTurn(450), 90);
  });

  it("maps the turned preview to the page", () => {
    // Turned 90° clockwise: the page's top-left corner shows top right.
    assert.deepEqual(previewToPage({ x: 1, y: 0 }, 90), { x: 0, y: 0 });
    assert.deepEqual(previewToPage({ x: 1, y: 1 }, 90), { x: 1, y: 0 });
    assert.deepEqual(previewToPage({ x: 0, y: 1 }, 270), { x: 0, y: 0 });
    assert.deepEqual(previewToPage({ x: 0.25, y: 0.1 }, 180), { x: 0.75, y: 0.9 });
    assert.deepEqual(previewToPage({ x: 0.25, y: 0.1 }, 0), { x: 0.25, y: 0.1 });
  });

  it("round-trips points and rectangles for every turn", () => {
    for (const quarter of [0, 90, 180, 270]) {
      const point = { x: 0.2, y: 0.7 };
      const back = previewToPage(pageToPreview(point, quarter), quarter);
      close(back.x, point.x);
      close(back.y, point.y);
      const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.5 };
      const again = previewRectToPage(pageRectToPreview(rect, quarter), quarter);
      close(again.x, rect.x);
      close(again.y, rect.y);
      close(again.width, rect.width);
      close(again.height, rect.height);
    }
  });

  it("swaps width and height of a selection on a sideways preview", () => {
    const onPage = previewRectToPage({ x: 0.5, y: 0, width: 0.5, height: 0.25 }, 90);
    close(onPage.x, 0);
    close(onPage.y, 0);
    close(onPage.width, 0.25);
    close(onPage.height, 0.5);
  });
});
