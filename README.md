# VisionCamera barcode scanner

VisionCamera **V5-only** scanning with Apple Vision on iOS and the same bundled
ML Kit **17.3.0** detector/options as the V5 reference scanner on Android.

## Install

```sh
npm install @archonsystemsinc/vision-camera-barcode-scanner react-native-vision-camera@5.2.3 react-native-vision-camera-worklets@5.2.3 react-native-nitro-modules react-native-nitro-image react-native-worklets
```

Use a Worklets version compatible with your React Native/Reanimated versions
(Stockroom uses RN 0.81.4 + Worklets 0.7.3). Configure `react-native-worklets/plugin`
in Babel, install pods, and rebuild the native app. Worklets Core is no longer used.
The generated Nitro bindings ship with the package; consumers do not run Nitrogen.

## Usage

```tsx
import { Camera, useCameraDevice } from "react-native-vision-camera";
import { scheduleOnRN } from "react-native-worklets";
import { useBarcodeScanner } from "@archonsystemsinc/vision-camera-barcode-scanner";

function Scanner({ onDetected, disabled = false }) {
  // Ask for camera permission before mounting this component.
  const device = useCameraDevice("back");
  const { props } = useBarcodeScanner({
    fps: 10,
    disabled,
    barcodeFormats: ["qr-code"], // omitted = all supported formats
    // Optional smaller viewfinder, relative to the Camera's top-left in layout points:
    // regionOfInterest: { x: 20, y: 100, width: 280, height: 200 },
    onBarcodeScanned(barcodes, frame, context) {
      "worklet";
      // All positions are already in the Camera view's coordinate system.
      scheduleOnRN(onDetected, barcodes);
    },
    onError: console.error,
  });
  if (!device) return null;
  return <Camera {...props} device={device} isActive={!disabled} style={{ flex: 1 }} />;
}
```

Spread all returned props: `ref`, `outputs`, `onLayout`, `onPreviewStarted`, and
`resizeMode` connect detection to the actual native preview. Compose these if you
need your own handlers/ref or additional camera outputs; do not silently overwrite them.

### Coordinates and visibility

- Results use V5 field names: `format`, `rawValue`, `displayValue`, `rawBytes`,
  `valueType`, `boundingBox: { left, right, top, bottom }`, and `cornerPoints`.
  They are plain snapshots, not disposable HybridObjects.
- Coordinates are **React Native layout points**, relative to the camera view.
  Conversion uses AVFoundation's capture-output-to-sensor transform on iOS,
  CameraX's frame-to-sensor transform on Android, and V5's native camera-to-preview method,
  including rotation, mirroring, scaling and preview cropping.
- Every corner must be inside **both** the visible camera rectangle and optional
  `regionOfInterest`. Partially clipped codes and missing corner geometry are rejected.
  On iOS, the visible rectangle/ROI is also mapped into the raw frame and used as
  Apple Vision's detection region. A small margin preserves barcode quiet zones;
  exact visibility filtering still runs afterward. Frames retain their full resolution.
  Android retains full-frame ML Kit detection and post-detection visibility filtering.
- Rotation updates positions on the next successful detection. If your callback
  throttles highlight rendering, bypass that throttle when `context.viewportChanged`
  is true. This also detects preview resize/mirror/transform changes.
- Empty results do **not** invoke the callback. Existing highlights must be cleared
  by your caller (Stockroom retains its one-second timeout).

### Controls

| Option | Default | Meaning |
| --- | --- | --- |
| `fps` | `5` | Maximum detection attempts per second; finite and positive |
| `idleFps` | `fps` | Rate after no visible barcode is found; positive and at most `fps`. First scan/resume is immediate; a visible result restores `fps`. Set to `1` for idle power saving (up to roughly one second before discovering a new code). |
| `disabled` | `false` | Skip detection; camera preview can remain active |
| `barcodeFormats` | `["all-formats"]` | V5 format names; cannot be empty |
| `regionOfInterest` | Whole view | `{ x, y, width, height }` in camera-local layout points |
| `resizeMode` | `"cover"` | Native preview scaling; also supports `"contain"` |
| `targetResolution` | `1920 × 1080` | Requested YUV frame resolution, negotiated by V5 |
| `onError` | Console error | JS-thread error callback |
| `debug` | `false` | Rate-limited pipeline and dropped-frame diagnostics; drop notifications are disconnected otherwise |

`onBarcodeScanned` runs as a **worklet**. Its frame is borrowed and disposed by the
hook after the callback, including error paths. Do not retain it, dispose it yourself,
or use it asynchronously. The hook handles unmounting internally.

### Detector differences

iOS deliberately retains Apple Vision: its supported formats depend on the OS,
`valueType` is `"unknown"`, and `rawBytes` is `undefined` because Vision does not
provide those ML Kit fields uniformly. `displayValue` uses Vision's payload string.
UPC-A is normalized from Apple's leading-zero EAN-13 representation when requested.
Android exposes ML Kit's original decoded values and semantic types.

`createBarcodeScanner({ barcodeFormats })` is a low-level synchronous API returning
raw-buffer pixel coordinates. Call `close()` when finished, then `dispose()` when no
runtime can still access the object. Most apps should use the viewport-aware hook.

## Migrating from V4

1. Upgrade VisionCamera and install its Worklets integration plus Nitro dependencies.
2. Replace Worklets Core shared values/bridges with `createSynchronizable` and `scheduleOnRN`.
3. Rename `barcodeTypes` to `barcodeFormats`, `"qr"` to `"qr-code"`, and `value` to `rawValue`.
4. Convert highlight rectangles from V5 bounds: `x = left`, `y = top`,
   `width = right - left`, `height = bottom - top`.
5. Remove V4 camera `format`, `pixelFormat`, and `frameProcessor` props. The hook
   supplies a V5 frame output. Set `targetResolution` on the hook if needed.

Old platform-specific models, native event emitter, JS geometry helpers,
`scanCodes(frame, layout, ...)`, and the manual `isMountedRef` option are removed.
Use VisionCamera's own `useCameraPermission` hook.

## Development

See [development and validation](docs/DEVELOPMENT.md). Upstream-derived portions
retain attribution in [NOTICE](NOTICE); this package is MIT licensed.
