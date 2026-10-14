import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, type LayoutChangeEvent } from "react-native";
import {
  useFrameOutput,
  type CameraRef,
  type Frame,
  type PreviewResizeMode,
  type PreviewView,
} from "react-native-vision-camera";
import { createSynchronizable, scheduleOnRN } from "react-native-worklets";
import { createBarcodeScanner } from "./factory";
import type { Barcode, TargetBarcodeFormat } from "./specs/Barcode";
import type { BarcodeScanner } from "./specs/BarcodeScanner.nitro";
import {
  detectionRegion,
  projectBarcode,
  transformKey,
  type ViewportRect,
} from "./viewport";

export type { ViewportRect } from "./viewport";

export interface ScanContext {
  /** Changes when the native frame-to-preview transform or preview layout changes. */
  viewportTransform: string;
  /** Compared to the last emitted (nonempty) result. */
  viewportChanged: boolean;
}

export interface UseBarcodeScannerOptions {
  barcodeFormats?: TargetBarcodeFormat[];
  /** Camera-local layout points; only fully contained codes are emitted. */
  regionOfInterest?: ViewportRect;
  /** Maximum detection attempts per second (not camera FPS). Default: 5. */
  fps?: number;
  /** Detection rate after an empty result. Defaults to fps (no idle throttling). */
  idleFps?: number;
  disabled?: boolean;
  resizeMode?: PreviewResizeMode;
  targetResolution?: { width: number; height: number };
  /** Worklet callback. Frame is valid only for the duration of this call. */
  onBarcodeScanned: (
    barcodes: Barcode[],
    frame: Frame,
    context: ScanContext,
  ) => void;
  /** Runs on the JS thread. */
  onError?: (error: Error) => void;
  /** Log pipeline state and coordinates (never barcode contents), at most once per second. */
  debug?: boolean;
}

const ALL_FORMATS: TargetBarcodeFormat[] = ["all-formats"];
const USE_NATIVE_ROI = Platform.OS === "ios";

export function useBarcodeScanner({
  barcodeFormats = ALL_FORMATS,
  regionOfInterest,
  fps = 5,
  idleFps = fps,
  disabled = false,
  resizeMode = "cover",
  targetResolution = { width: 1920, height: 1080 },
  onBarcodeScanned,
  onError,
  debug = false,
}: UseBarcodeScannerOptions) {
  if (!Number.isFinite(fps) || fps <= 0)
    throw new Error("fps must be a finite positive number");
  if (!Number.isFinite(idleFps) || idleFps <= 0 || idleFps > fps)
    throw new Error(
      "idleFps must be a finite positive number no greater than fps",
    );
  if (barcodeFormats.length === 0)
    throw new Error("barcodeFormats must not be empty");
  if (
    regionOfInterest != null &&
    (!Object.values(regionOfInterest).every(Number.isFinite) ||
      regionOfInterest.width <= 0 ||
      regionOfInterest.height <= 0)
  ) {
    throw new Error(
      "regionOfInterest must have finite coordinates and positive dimensions",
    );
  }

  const cameraRef = useRef<CameraRef | null>(null);
  const [preview, setPreview] = useState<PreviewView>();
  const [scanner, setScanner] = useState<BarcodeScanner>();
  const layout = useMemo(
    () => createSynchronizable({ width: 0, height: 0 }),
    [],
  );
  const mounted = useMemo(() => createSynchronizable(false), []);
  const lastDiagnostic = useMemo(() => createSynchronizable(-Infinity), []);
  const lastDetectionDiagnostic = useMemo(
    () => createSynchronizable(-Infinity),
    [],
  );
  const timing = useMemo(
    () =>
      createSynchronizable({
        lastScan: -1,
        lastTransform: "",
        hasBarcodes: false,
      }),
    [],
  );
  const [controls] = useState(() =>
    createSynchronizable({ fps, idleFps, disabled, regionOfInterest }),
  );
  const formatsKey = JSON.stringify(barcodeFormats);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const reportError = useCallback((message: string) => {
    if (errorRef.current) errorRef.current(new Error(message));
    else console.error(`[BarcodeScanner] ${message}`);
  }, []);
  const reportDiagnostic = useCallback((message: string) => {
    console.info(`[BarcodeScanner:debug] ${message}`);
  }, []);
  useEffect(() => {
    if (debug)
      reportDiagnostic(
        JSON.stringify({
          stage: "setup",
          scannerReady: scanner != null,
          previewReady: preview != null,
        }),
      );
  }, [debug, scanner, preview, reportDiagnostic]);

  useEffect(() => {
    mounted.setBlocking(true);
    return () => mounted.setBlocking(false);
  }, [mounted]);

  useEffect(() => {
    controls.setBlocking({ fps, idleFps, disabled, regionOfInterest });
  }, [controls, fps, idleFps, disabled, regionOfInterest]);

  useEffect(() => {
    timing.setBlocking({ lastScan: -1, lastTransform: "", hasBarcodes: false });
  }, [disabled, scanner, preview, timing]);

  const ref = useCallback((camera: CameraRef | null) => {
    cameraRef.current = camera;
    setPreview(camera?.preview);
  }, []);
  const onPreviewStarted = useCallback(() => {
    setPreview(cameraRef.current?.preview);
  }, []);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      layout.setBlocking({ width, height });
    },
    [layout],
  );

  // Published V5 memoizes outputs by object identity, not resolution values.
  // A fresh resolution would recreate the output, whose scanner effect sets
  // state and renders again, creating an unbounded output/scanner loop.
  const resolutionWidth = targetResolution.width;
  const resolutionHeight = targetResolution.height;
  const stableResolution = useMemo(
    () => ({ width: resolutionWidth, height: resolutionHeight }),
    [resolutionWidth, resolutionHeight],
  );
  const output = useFrameOutput({
    pixelFormat: "yuv",
    targetResolution: stableResolution,
    dropFramesWhileBusy: true,
    enablePhysicalBufferRotation: false,
    onFrame(frame) {
      "worklet";
      try {
        const options = controls.getBlocking();
        const diagnosticTime = performance.now();
        const shouldDiagnose =
          debug && diagnosticTime - lastDiagnostic.getBlocking() >= 1000;
        if (shouldDiagnose) {
          lastDiagnostic.setBlocking(diagnosticTime);
          scheduleOnRN(
            reportDiagnostic,
            JSON.stringify({
              stage: "frame",
              mounted: mounted.getBlocking(),
              disabled: options.disabled,
              scannerReady: scanner != null,
              previewReady: preview != null,
              viewport: layout.getBlocking(),
              frame: {
                width: frame.width,
                height: frame.height,
                orientation: frame.orientation,
                mirrored: frame.isMirrored,
              },
            }),
          );
        }
        if (
          !mounted.getBlocking() ||
          options.disabled ||
          scanner == null ||
          preview == null
        )
          return;
        const initialViewport = layout.getBlocking();
        if (initialViewport.width <= 0 || initialViewport.height <= 0) return;
        const now = performance.now();
        const previous = timing.getBlocking();
        const targetFps = previous.hasBarcodes ? options.fps : options.idleFps;
        if (
          previous.lastScan >= 0 &&
          now >= previous.lastScan &&
          now - previous.lastScan < 1000 / targetFps
        )
          return;
        timing.setBlocking({ ...previous, lastScan: now });

        const nativeRegion = USE_NATIVE_ROI
          ? detectionRegion(
              initialViewport,
              (point) => {
                "worklet";
                return preview.convertViewPointToCameraPoint(point);
              },
              options.regionOfInterest,
            )
          : undefined;
        if (USE_NATIVE_ROI && nativeRegion == null) return;
        const codes = scanner.scanCodes(frame, nativeRegion);
        // Detection can overlap a JS-side layout/ROI update. Filter against
        // the latest viewport, not the one from the start of the scan.
        const viewport = layout.getBlocking();
        const currentOptions = controls.getBlocking();
        const project = (point: { x: number; y: number }) => {
          "worklet";
          return preview.convertCameraPointToViewPoint(
            scanner.convertFramePointToCameraPoint(frame, point),
          );
        };
        const barcodes: Barcode[] = [];
        for (const code of codes) {
          const visible = projectBarcode(
            code,
            project,
            viewport,
            currentOptions.regionOfInterest,
          );
          if (visible != null) barcodes.push(visible);
        }
        timing.setBlocking({
          ...previous,
          lastScan: now,
          hasBarcodes: barcodes.length > 0,
        });
        if (
          debug &&
          diagnosticTime - lastDetectionDiagnostic.getBlocking() >= 1000
        ) {
          lastDetectionDiagnostic.setBlocking(diagnosticTime);
          const first = codes[0];
          const raw = first?.cornerPoints ?? [];
          const sensor = raw.map((point) =>
            scanner.convertFramePointToCameraPoint(frame, point),
          );
          const view = sensor.map((point) =>
            preview.convertCameraPointToViewPoint(point),
          );
          scheduleOnRN(
            reportDiagnostic,
            JSON.stringify({
              stage: "detection",
              detected: codes.length,
              accepted: barcodes.length,
              raw,
              sensor,
              view,
              viewport,
              roi: currentOptions.regionOfInterest,
            }),
          );
        }
        // Preserve nonempty-only callbacks and suppress delivery after pause/unmount.
        if (
          barcodes.length === 0 ||
          !mounted.getBlocking() ||
          controls.getBlocking().disabled
        )
          return;
        const signature =
          `${frame.orientation}:${frame.isMirrored}:` +
          transformKey(
            [
              project({ x: 0, y: 0 }),
              project({ x: frame.width, y: 0 }),
              project({ x: 0, y: frame.height }),
            ],
            viewport.width,
            viewport.height,
          );
        timing.setBlocking({
          lastScan: now,
          lastTransform: signature,
          hasBarcodes: true,
        });
        onBarcodeScanned(barcodes, frame, {
          viewportTransform: signature,
          viewportChanged: previous.lastTransform !== signature,
        });
      } catch (error) {
        scheduleOnRN(reportError, String(error));
      } finally {
        // Includes throttled, disabled, empty, failed and successfully scanned frames.
        frame.dispose();
      }
    },
  });
  useEffect(() => {
    let dropped = 0;
    let lastReport = -Infinity;
    // Override V5's per-drop JS warning; expected backpressure must not generate bridge traffic.
    output.setOnFrameDroppedCallback(
      debug
        ? (reason) => {
            dropped += 1;
            const now = performance.now();
            if (now - lastReport < 1000) return;
            reportDiagnostic(
              JSON.stringify({
                stage: "dropped-frames",
                count: dropped,
                reason,
              }),
            );
            dropped = 0;
            lastReport = now;
          }
        : undefined,
    );
    return () => output.setOnFrameDroppedCallback(undefined);
  }, [output, debug, reportDiagnostic]);
  useEffect(() => {
    let instance: BarcodeScanner;
    try {
      instance = createBarcodeScanner({
        barcodeFormats: JSON.parse(formatsKey) as TargetBarcodeFormat[],
        frameOutput: output,
      });
      setScanner(instance);
    } catch (error) {
      setScanner(undefined);
      reportError(String(error));
      return;
    }
    // close() is synchronized natively and safe with an in-flight scan. Unlike
    // dispose(), it keeps old runtime closures callable until V5 replaces them.
    return () => instance.close();
  }, [formatsKey, output, reportError]);
  const outputs = useMemo(() => [output], [output]);

  return { props: { ref, outputs, onLayout, onPreviewStarted, resizeMode } };
}
