/** V5 barcode formats, shared by both detectors. */
export type BarcodeFormat =
  | "unknown"
  | "code-128"
  | "code-39"
  | "code-93"
  | "codabar"
  | "data-matrix"
  | "ean-13"
  | "ean-8"
  | "itf"
  | "qr-code"
  | "upc-a"
  | "upc-e"
  | "pdf-417"
  | "aztec";
export type TargetBarcodeFormat =
  | Exclude<BarcodeFormat, "unknown">
  | "all-formats";
export type BarcodeValueType =
  | "unknown"
  | "contact-info"
  | "email"
  | "isbn"
  | "phone"
  | "product"
  | "sms"
  | "text"
  | "url"
  | "wifi"
  | "geo"
  | "calendar-event"
  | "driver-license";
export interface Point {
  x: number;
  y: number;
}
/** V5 rectangle shape. Coordinates are React Native layout points in hook results. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
/** Plain value snapshot: safe to send from a worklet to JS. */
export interface Barcode {
  format: BarcodeFormat;
  boundingBox: Rect;
  cornerPoints: Point[];
  displayValue: string | undefined;
  rawBytes: ArrayBuffer | undefined;
  rawValue: string | undefined;
  valueType: BarcodeValueType;
}
