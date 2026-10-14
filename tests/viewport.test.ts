import { describe, expect, it } from "vitest";
import type { Barcode } from "../src/specs/Barcode";
import { detectionRegion, projectBarcode, transformKey } from "../src/viewport";

const barcode: Barcode = {
  format: "qr-code",
  rawValue: "test",
  displayValue: "test",
  rawBytes: undefined,
  valueType: "text",
  boundingBox: { left: 10, right: 30, top: 20, bottom: 40 },
  cornerPoints: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }, { x: 10, y: 40 }],
};
const identity = (point: { x: number; y: number }) => point;
const viewport = { width: 100, height: 100 };

describe("viewport filtering", () => {
  it("maps a viewfinder into rotated and mirrored sensor axes", () => {
    expect(detectionRegion(viewport, p => ({ x: p.y / 100, y: 1 - p.x / 100 }),
      { x: 10, y: 20, width: 30, height: 40 })).toEqual({ left: 0.2, right: 0.6, top: 0.6, bottom: 0.9 });
    expect(detectionRegion(viewport, p => ({ x: 1 - p.x / 100, y: p.y / 100 }),
      { x: 10, y: 20, width: 30, height: 40 })).toEqual({ left: 0.6, right: 0.9, top: 0.2, bottom: 0.6 });
  });

  it("rejects invalid native mappings and skips empty intersections", () => {
    expect(() => detectionRegion(viewport, () => ({ x: NaN, y: 0 }))).toThrow("invalid camera coordinates");
    const project = () => { throw new Error("must not project an empty ROI"); };
    expect(detectionRegion(viewport, project, { x: 100, y: 0, width: 10, height: 10 })).toBeUndefined();
    expect(detectionRegion({ width: 0, height: 0 }, project)).toBeUndefined();
  });

  it("projects all corners and rebuilds bounds after rotation", () => {
    const result = projectBarcode(barcode, p => ({ x: 100 - p.y, y: p.x }), viewport);
    expect(result?.boundingBox).toEqual({ left: 60, right: 80, top: 10, bottom: 30 });
    expect(result?.cornerPoints[0]).toEqual({ x: 80, y: 10 });
    expect(barcode.cornerPoints[0]).toEqual({ x: 10, y: 20 });
  });

  it("rejects partially cropped codes even when their center is visible", () => {
    expect(projectBarcode(barcode, p => ({ x: p.x - 20, y: p.y }), viewport)).toBeUndefined();
  });

  it("intersects the smaller viewfinder with the visible camera", () => {
    expect(projectBarcode(barcode, identity, viewport, { x: 20, y: 0, width: 80, height: 100 })).toBeUndefined();
    expect(projectBarcode(barcode, identity, { width: 25, height: 100 }, { x: 0, y: 0, width: 100, height: 100 })).toBeUndefined();
    expect(projectBarcode(barcode, identity, viewport, { x: 10, y: 20, width: 20, height: 20 })).toBeDefined();
  });

  it("rejects missing corners, invalid transforms, and unlaid-out views", () => {
    expect(projectBarcode({ ...barcode, cornerPoints: [] }, identity, viewport)).toBeUndefined();
    expect(projectBarcode(barcode, () => ({ x: NaN, y: 1 }), viewport)).toBeUndefined();
    expect(projectBarcode(barcode, identity, { width: 0, height: 0 })).toBeUndefined();
  });

  it("detects 180-degree rotation even when layout dimensions stay the same", () => {
    const before = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    const after = before.map(p => ({ x: 100 - p.x, y: 100 - p.y }));
    expect(transformKey(before, 100, 100)).not.toBe(transformKey(after, 100, 100));
  });
});
