import { type ViewProps } from "react-native";
import {
  runAtTargetFps,
  useFrameProcessor,
  type CameraProps,
  type Frame,
} from "react-native-vision-camera";
import { useSharedValue } from "react-native-worklets-core";
import { ScanBarcodesOptions, scanCodes } from "src/module";
import type { Barcode, BarcodeType, Rect, Size } from "src/types";
import { useLatestSharedValue } from "./useLatestSharedValue";

type ResizeMode = NonNullable<CameraProps["resizeMode"]>;

export type UseBarcodeScannerOptions = {
  barcodeTypes?: BarcodeType[];
  regionOfInterest?: Rect;
  fps?: number;
  onBarcodeScanned: (barcodes: Barcode[], frame: Frame) => void;
  resizeMode?: ResizeMode;
  isMountedRef?: { value: boolean };
};

export const useBarcodeScanner = ({
  barcodeTypes,
  regionOfInterest,
  onBarcodeScanned,
  resizeMode = "cover",
  isMountedRef,
  fps = 5,
}: UseBarcodeScannerOptions) => {
  // Layout of the <Camera /> component
  const layoutRef = useSharedValue<Size>({ width: 0, height: 0 });
  const onLayout: ViewProps["onLayout"] = (event) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.value = { width, height };
  };

  const resizeModeRef = useLatestSharedValue<ResizeMode>(resizeMode);
  const isPristineRef = useSharedValue<boolean>(true);

  // Barcode highlights related state
  const barcodesRef = useSharedValue<Barcode[]>([]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (isMountedRef && isMountedRef.value === false) {
        return;
      }
      runAtTargetFps(fps, () => {
        "worklet";

        // We must ignore the first frame because as it has width/height inverted (maybe the right value though?)
        if (isPristineRef.value) {
          isPristineRef.value = false;
          return;
        }

        const { value: layout } = layoutRef;
        const { value: resizeMode } = resizeModeRef;

        // Call the native barcode scanner
        const options: ScanBarcodesOptions = {};
        if (barcodeTypes !== undefined) {
          options.barcodeTypes = barcodeTypes;
        }
        if (regionOfInterest !== undefined) {
          const { x, y, width, height } = regionOfInterest;
          options.regionOfInterest = [x, y, width, height];
        }
        const barcodes = scanCodes(frame, layout, options, resizeMode);

        if (barcodes.length > 0) {
          onBarcodeScanned(barcodes, frame);
          barcodesRef.value = barcodes;
        }
      });
    },
    [layoutRef, resizeModeRef],
  );

  return {
    props: {
      frameProcessor,
      onLayout,
    },
  };
};
