import type { HybridObject } from "react-native-nitro-modules";
import type { CameraFrameOutput, Frame } from "react-native-vision-camera";
import type { Barcode, Point, Rect, TargetBarcodeFormat } from "./Barcode";

export interface BarcodeScannerOptions {
  barcodeFormats: TargetBarcodeFormat[];
  /** The output producing frames, required for native iOS coordinate conversion. */
  frameOutput?: CameraFrameOutput;
}

/** Low-level scanner. Coordinates are raw frame-buffer pixels; use the hook for viewport results. */
export interface BarcodeScanner
  extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  /** Optional iOS detection hint in camera sensor coordinates; results remain full-frame pixels. */
  scanCodes(frame: Frame, regionOfInterest?: Rect): Barcode[];
  /** Convert raw-buffer pixels to the sensor coordinates expected by the preview. */
  convertFramePointToCameraPoint(frame: Frame, point: Point): Point;
  /** Release detector resources. Subsequent scans return no results. */
  close(): void;
}

export interface ArchonBarcodeScannerFactory
  extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  createBarcodeScanner(options: BarcodeScannerOptions): BarcodeScanner;
}
