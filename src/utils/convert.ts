import { Platform } from "react-native";
import type { CameraProps, Frame } from "react-native-vision-camera";
import type {
  AndroidBarcode,
  Barcode,
  BoundingBox,
  Point,
  Size,
  iOSBarcode,
} from "src/types";
import {
  applyScaleFactor,
  applyTransformation,
  normalizePrecision,
} from "./geometry";
import { normalizeAndroidCodeType, normalizeiOSCodeType } from "./types";

export const isIOSBarcode = (
  barcode: iOSBarcode | AndroidBarcode,
): barcode is iOSBarcode => {
  "worklet";
  return Platform.OS === "ios";
};

export const isAndroidBarcode = (
  barcode: iOSBarcode | AndroidBarcode,
): barcode is AndroidBarcode => {
  "worklet";
  return Platform.OS === "android";
};

export const computeBoundingBoxFromCornerPoints = (
  cornerPoints: Point[],
): BoundingBox => {
  "worklet";
  const xArray = cornerPoints.map((corner) => corner.x);
  const yArray = cornerPoints.map((corner) => corner.y);
  // @NOTE we can't use destructuring here because babel would wrap it in non-worklet functions
  const x = Math.min.apply(null, xArray);
  const y = Math.min.apply(null, yArray);
  const width = Math.max.apply(null, xArray) - x;
  const height = Math.max.apply(null, yArray) - y;
  return {
    origin: { x, y },
    size: {
      width,
      height,
    },
  };
};

export const computeBoundingBoxAndTransform = (
  cornerPoints: Point[],
  frame: Pick<Frame, "width" | "height" | "orientation">,
  layout: Size,
  resizeMode: CameraProps["resizeMode"],
): BoundingBox => {
  "worklet";

  const adjustedLayout = {
    width: layout.height,
    height: layout.width,
  };

  let translatedCornerPoints = cornerPoints;

  translatedCornerPoints = translatedCornerPoints?.map((point) => {
    const scaledPoint = applyScaleFactor(
      point,
      frame,
      adjustedLayout,
      resizeMode,
    );
    return applyTransformation(scaledPoint, adjustedLayout, frame.orientation);
  });

  const valueFromCornerPoints = computeBoundingBoxFromCornerPoints(
    translatedCornerPoints!,
  );

  return valueFromCornerPoints;
};

export const normalizeNativeBarcode = (
  barcode: iOSBarcode | AndroidBarcode,
  frame: Frame,
  layout: Size,
  resizeMode: CameraProps["resizeMode"],
): Barcode => {
  "worklet";
  if (isIOSBarcode(barcode)) {
    const { payload, symbology, corners } = barcode;
    return {
      value: payload,
      type: normalizeiOSCodeType(symbology),
      boundingBox: computeBoundingBoxAndTransform(
        Object.values(corners).map(({ x, y }) => ({
          x: normalizePrecision(x * frame.width),
          y: normalizePrecision(y * frame.height),
        })),
        frame,
        layout,
        resizeMode,
      ),
      native: barcode,
    };
  } else if (isAndroidBarcode(barcode)) {
    const { rawValue, format, cornerPoints } = barcode;
    return {
      value: rawValue,
      type: normalizeAndroidCodeType(format),
      boundingBox: computeBoundingBoxAndTransform(
        cornerPoints,
        frame,
        layout,
        resizeMode,
      ),
      native: barcode,
    };
  } else {
    throw new Error(`Unsupported platform: ${Platform.OS}`);
  }
};
