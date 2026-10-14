import type { Barcode, Point, Rect } from "./specs/Barcode";

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function bounds(points: Point[]): Rect {
  "worklet";
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
}

/** Intersect the requested ROI with the visible preview before converting to sensor coordinates. */
export function detectionRegion(
  viewport: { width: number; height: number },
  toCamera: (point: Point) => Point,
  roi?: ViewportRect,
): Rect | undefined {
  "worklet";
  const left = Math.max(0, roi?.x ?? 0);
  const top = Math.max(0, roi?.y ?? 0);
  const right = Math.min(
    viewport.width,
    roi == null ? viewport.width : roi.x + roi.width,
  );
  const bottom = Math.min(
    viewport.height,
    roi == null ? viewport.height : roi.y + roi.height,
  );
  if (right <= left || bottom <= top) return undefined;
  const points = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ].map(toCamera);
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error("Preview returned invalid camera coordinates");
  }
  return bounds(points);
}

/** Exact post-detection filtering: codes touching an edge are accepted. */
export function projectBarcode(
  barcode: Barcode,
  project: (point: Point) => Point,
  viewport: { width: number; height: number },
  roi?: ViewportRect,
): Barcode | undefined {
  "worklet";
  if (viewport.width <= 0 || viewport.height <= 0) return undefined;
  const left = Math.max(0, roi?.x ?? 0);
  const top = Math.max(0, roi?.y ?? 0);
  const right = Math.min(
    viewport.width,
    roi == null ? viewport.width : roi.x + roi.width,
  );
  const bottom = Math.min(
    viewport.height,
    roi == null ? viewport.height : roi.y + roi.height,
  );
  if (right <= left || bottom <= top) return undefined;
  // Never accept a detection with missing/invalid geometry.
  if (barcode.cornerPoints.length < 4) return undefined;
  const cornerPoints = barcode.cornerPoints.map(project);
  if (
    cornerPoints.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < left ||
        p.x > right ||
        p.y < top ||
        p.y > bottom,
    )
  )
    return undefined;
  return { ...barcode, cornerPoints, boundingBox: bounds(cornerPoints) };
}

export function transformKey(
  points: Point[],
  width: number,
  height: number,
): string {
  "worklet";
  return (
    `${width},${height}:` +
    points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(";")
  );
}
