export { createBarcodeScanner } from "./factory";
export type {
  Barcode,
  BarcodeFormat,
  BarcodeValueType,
  Point,
  Rect,
  TargetBarcodeFormat,
} from "./specs/Barcode";
export type {
  BarcodeScanner,
  BarcodeScannerOptions,
} from "./specs/BarcodeScanner.nitro";
export { useBarcodeScanner } from "./useBarcodeScanner";
export type {
  ScanContext,
  UseBarcodeScannerOptions,
  ViewportRect,
} from "./useBarcodeScanner";
