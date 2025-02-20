# vision-camera-barcode-scanner

This is a fork of https://github.com/mgcrea/vision-camera-barcode-scanner with fixes for the bounding box calculation in vision camera v4.

## Features

High performance barcode scanner for React Native using VisionCamera.

- **Modern and future-proof:** Built on [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) with minimal native dependencies for each platforms to minimize future build-failure risk.

- **Minimal footprint:** Leverages [Google's MLKit BarcodeScanner](https://developers.google.com/android/reference/com/google/mlkit/vision/barcode/package-summary) on Android and [Apple's Vision VNDetectBarcodesRequest](https://developer.apple.com/documentation/vision/vndetectbarcodesrequest).

- **Powerful & Performant:** The implementation has been tailored for advanced use cases where performance is critical. Scanning barcodes is butter smooth at 30fps, and you can customize the detection speed loop (detection fps).

- **Hooks based:** Exposes easy-to-use hooks [`useBarcodeScanner`](./src/hooks/useBarcodeScanner.ts) to quickly get started

<!-- Check the [**Documentation**](https://mgcrea.github.io/vision-camera-barcode-scanner/) for usage details. -->

## Demo

![demo](./.github/assets/demo.gif)

## Install

```bash
npm install @archonsystemsinc/vision-camera-barcode-scanner
# or
yarn add @archonsystemsinc/vision-camera-barcode-scanner
# or
pnpm add @archonsystemsinc/vision-camera-barcode-scanner
```

### Dependencies

This package relies on:

- [react-native-vision-camera@>=4](https://github.com/mrousavy/react-native-vision-camera)
- [react-native-worklets-core](https://github.com/margelo/react-native-worklets-core)

You must add them as dependencies to your project:

```bash
npm install react-native-vision-camera react-native-worklets-core
# or
yarn add react-native-vision-camera react-native-worklets-core
# or
pnpm add react-native-vision-camera react-native-worklets-core
```

Then you must follow their respective installation instructions:

- [react-native-worklets-core](https://github.com/margelo/react-native-worklets-core#installation)

## Quickstart

Unlike mgcrea's original package we do not provide a highlights component. That means you have to draw highlights yourself using your own component. If you've used expo camera, the API here is meant to be similar where onBarcodesScanned gives you the barcodes with their bounding box, except we give multiple barcodes instead of one.

```tsx
import { useBarcodeScanner, Barcode } from "@archonsystemsinc/vision-camera-barcode-scanner";
import type { FunctionComponent } from "react";
import { StyleSheet } from "react-native";
import Highlights from "./Highlights"

export const App: FunctionComponent = () => {
  // @NOTE you must properly ask for camera permissions first!
  // You should use `PermissionsAndroid` for Android and `Camera.requestCameraPermission()` on iOS.

  const [barcodes, setBarcodes] = useState<Barcode[]>([])
  const setBarcodesJS = Worklets.createRunOnJS(setBarcodes)
  const { props: cameraProps } = useBarcodeScanner({
    fps: 5,
    barcodeTypes: ["qr", "ean-13"], // optional
    onBarcodeScanned: (barcodes) => {
      "worklet";
      // The barcodes here return the bounding box positions relative to the view, similar to expo camera's api
      setBarcodesJS(barcodes)
      );
    },
  });

  const devices = useCameraDevices();
  const device = devices.find(({ position }) => position === "back");
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1920, height: 1080 } },
  ]);
  if (!device) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        {...cameraProps}
      />
      <Highlights barcodes={barcodes} />
    </View>
  );
};
```

## Authors

- Original library author: [Olivier Louvignes](https://github.com/mgcrea) <<olivier@mgcrea.io>>
- Forked by Archon Systems Inc

## License

```txt
The MIT License

Copyright (c) 2023 Olivier Louvignes <olivier@mgcrea.io>
Copyright (c) 2025 Archon Systems Inc

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
