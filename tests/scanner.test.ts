import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraRef, Frame, UseFrameOutputProps } from "react-native-vision-camera";
import { useBarcodeScanner, type UseBarcodeScannerOptions } from "../src/useBarcodeScanner";

const native = vi.hoisted(() => ({
  onFrame: undefined as UseFrameOutputProps["onFrame"],
  scan: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
  output: { setOnFrameDroppedCallback: vi.fn() },
  project: vi.fn(),
  install: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("react-native-vision-camera", () => ({
  VisionCamera: { createFrameOutput: () => ({ ...native.output, thread: {} }) },
}));
vi.mock("react-native-vision-camera-worklets", () => ({
  provider: { createRuntimeForThread: () => ({
    setOnFrameCallback: (output: unknown, callback: UseFrameOutputProps["onFrame"]) => {
      native.install(output, callback);
      native.onFrame = callback;
    },
  }) },
}));
vi.mock("react-native-worklets", () => ({
  createSynchronizable: (initial: unknown) => {
    let value = initial;
    return { getBlocking: () => value, setBlocking: (next: unknown) => { value = next; } };
  },
  scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
}));
vi.mock("../src/factory", () => ({ createBarcodeScanner: native.create }));

const code = {
  format: "qr-code", rawValue: "same-value", displayValue: "same-value", valueType: "text",
  boundingBox: { left: 10, right: 20, top: 10, bottom: 20 },
  cornerPoints: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
};
let result: ReturnType<typeof useBarcodeScanner>;
let renderer: ReactTestRenderer | undefined;
let rotated: boolean;
let now: number;

function Probe(props: UseBarcodeScannerOptions) {
  result = useBarcodeScanner(props);
  return null;
}
function frame() {
  return {
    width: 100, height: 100, dispose: vi.fn(),
    convertFramePointToCameraPoint: (p: { x: number; y: number }) => p,
  } as unknown as Frame;
}
async function mount(props: UseBarcodeScannerOptions) {
  await act(async () => { renderer = create(React.createElement(Probe, props)); });
  await act(async () => {
    result.props.ref({ preview: {
      convertViewPointToCameraPoint: (p: { x: number; y: number }) =>
        rotated ? { x: 100 - p.x, y: 100 - p.y } : p,
      convertCameraPointToViewPoint: (p: { x: number; y: number }) =>
        rotated ? { x: 100 - p.x, y: 100 - p.y } : p,
    } } as unknown as CameraRef);
    result.props.onLayout({ nativeEvent: { layout: { width: 100, height: 100, x: 0, y: 0 } } } as never);
  });
}
function scan() {
  const input = frame();
  native.onFrame!(input);
  expect(input.dispose).toHaveBeenCalledExactlyOnceWith();
  return input;
}

it("keeps frame registration stable across unrelated renders", async () => {
  const onBarcodeScanned = vi.fn();
  await mount({ onBarcodeScanned });
  native.install.mockClear();
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      renderer!.update(React.createElement(Probe, { onBarcodeScanned }));
    });
  }
  expect(native.install).not.toHaveBeenCalled();
});

it("unregisters discarded outputs on resolution changes and unmount", async () => {
  const onBarcodeScanned = vi.fn();
  await mount({ onBarcodeScanned });
  const previousOutput = result.props.outputs[0];
  native.install.mockClear();
  await act(async () => {
    renderer!.update(React.createElement(Probe, {
      onBarcodeScanned, targetResolution: { width: 640, height: 480 },
    }));
  });
  expect(native.install).toHaveBeenCalledWith(previousOutput, undefined);
  const currentOutput = result.props.outputs[0];
  expect(currentOutput).not.toBe(previousOutput);
  expect(native.onFrame).toBeTypeOf("function");
  native.install.mockClear();
  await act(async () => { renderer!.unmount(); });
  renderer = undefined;
  expect(native.install).toHaveBeenLastCalledWith(currentOutput, undefined);
  expect(native.onFrame).toBeUndefined();
});

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  rotated = false;
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  native.scan.mockReset().mockReturnValue([code]);
  native.output.setOnFrameDroppedCallback.mockReset();
  native.close.mockReset();
  native.project.mockReset().mockImplementation((_frame, point) => point);
  native.create.mockReset().mockReturnValue({ scanCodes: native.scan, close: native.close, convertFramePointToCameraPoint: native.project });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
});

describe("scanner lifecycle and callbacks", () => {
  it("switches between idle and active rates using visible results", async () => {
    const callback = vi.fn();
    native.scan.mockReturnValueOnce([]);
    await mount({ onBarcodeScanned: callback, fps: 5, idleFps: 1 });
    scan(); // First discovery is immediate.
    now += 200;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(1);
    now += 800;
    scan(); // Finds a barcode and switches to 5 FPS.
    expect(callback).toHaveBeenCalledTimes(1);
    now += 199;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(2);
    now += 1;
    native.scan.mockReturnValueOnce([]);
    scan(); // Losing it returns to 1 FPS.
    now += 200;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(3);
    now += 800;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(4);
  });

  it("keeps out-of-viewfinder detections idle and scans immediately after resuming", async () => {
    native.project.mockImplementation((_frame, p) => ({ x: p.x + 200, y: p.y }));
    const props = { onBarcodeScanned: vi.fn(), fps: 5, idleFps: 1 };
    await mount(props);
    scan();
    now += 200;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(1);
    await act(async () => renderer!.update(React.createElement(Probe, { ...props, disabled: true })));
    scan();
    expect(native.scan).toHaveBeenCalledTimes(1);
    await act(async () => renderer!.update(React.createElement(Probe, props)));
    scan();
    expect(native.scan).toHaveBeenCalledTimes(2);
  });

  it("passes the visible ROI to native detection and skips an entirely hidden ROI", async () => {
    await mount({ onBarcodeScanned: vi.fn(), regionOfInterest: { x: -10, y: 20, width: 40, height: 50 } });
    const input = scan();
    expect(native.scan).toHaveBeenLastCalledWith(input, { left: 0, right: 30, top: 20, bottom: 70 });
    rotated = true;
    now += 1000;
    scan();
    expect(native.scan.mock.calls[1][1]).toEqual({ left: 70, right: 100, top: 30, bottom: 80 });
    await act(async () => renderer!.update(React.createElement(Probe, {
      onBarcodeScanned: vi.fn(), regionOfInterest: { x: 101, y: 0, width: 10, height: 10 },
    })));
    now += 1000;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(2);
  });

  it("disconnects dropped-frame notifications unless debug is enabled and aggregates diagnostics", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const onBarcodeScanned = vi.fn();
    await mount({ onBarcodeScanned });
    expect(native.output.setOnFrameDroppedCallback).toHaveBeenLastCalledWith(undefined);
    await act(async () => renderer!.update(React.createElement(Probe, { onBarcodeScanned, debug: true })));
    log.mockClear();
    const onDropped = native.output.setOnFrameDroppedCallback.mock.lastCall![0];
    onDropped("out-of-buffers");
    now += 100;
    onDropped("out-of-buffers");
    onDropped("out-of-buffers");
    expect(log).toHaveBeenCalledTimes(1);
    now += 900;
    onDropped("out-of-buffers");
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1][0]).toContain('"count":3');
    await act(async () => renderer!.update(React.createElement(Probe, { onBarcodeScanned })));
    expect(native.output.setOnFrameDroppedCallback).toHaveBeenLastCalledWith(undefined);
  });

  it("keeps the output and scanner stable across equivalent resolution objects", async () => {
    const callback = vi.fn();
    await mount({ onBarcodeScanned: callback });
    const originalOutput = result.props.outputs[0];
    expect(native.create).toHaveBeenCalledTimes(1);
    await act(async () => renderer!.update(React.createElement(Probe, {
      onBarcodeScanned: callback,
      targetResolution: { width: 1920, height: 1080 },
    })));
    expect(result.props.outputs[0]).toBe(originalOutput);
    expect(native.create).toHaveBeenCalledTimes(1);
    expect(native.close).not.toHaveBeenCalled();
    await act(async () => renderer!.update(React.createElement(Probe, {
      onBarcodeScanned: callback,
      targetResolution: { width: 1280, height: 720 },
    })));
    expect(result.props.outputs[0]).not.toBe(originalOutput);
    expect(native.create).toHaveBeenCalledTimes(2);
    expect(native.close).toHaveBeenCalledTimes(1);
  });
  it("uses output-native coordinates instead of device-relative frame orientation", async () => {
    const callback = vi.fn();
    await mount({ onBarcodeScanned: callback });
    expect(native.create).toHaveBeenCalledWith({ barcodeFormats: ["all-formats"], frameOutput: result.props.outputs[0] });
    native.project.mockImplementation((_frame, p) => ({ x: p.y, y: 100 - p.x }));
    const input = frame();
    input.convertFramePointToCameraPoint = () => { throw new Error("device-relative conversion must not be used on iOS"); };
    native.onFrame!(input);
    expect(callback.mock.calls[0][0][0].boundingBox).toEqual({ left: 10, right: 20, top: 80, bottom: 90 });
    expect(input.dispose).toHaveBeenCalledOnce();
  });
  it("limits detection attempts and disposes even skipped frames", async () => {
    const callback = vi.fn();
    await mount({ fps: 10, onBarcodeScanned: callback });
    scan();
    now += 99;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(1);
    now += 1;
    scan();
    expect(native.scan).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("marks the next detection after rotation without changing barcode values", async () => {
    const callback = vi.fn();
    await mount({ fps: 10, onBarcodeScanned: callback });
    scan();
    now += 100;
    scan();
    expect(callback.mock.calls[1][2].viewportChanged).toBe(false);
    rotated = true;
    now += 100;
    scan();
    expect(callback.mock.calls[2][2].viewportChanged).toBe(true);
    expect(callback.mock.calls[2][0][0].boundingBox).toEqual({ left: 80, right: 90, top: 80, bottom: 90 });
  });

  it("does not emit empty or out-of-viewfinder detections", async () => {
    const callback = vi.fn();
    await mount({ onBarcodeScanned: callback, regionOfInterest: { x: 50, y: 50, width: 50, height: 50 } });
    scan();
    native.scan.mockReturnValue([]);
    now += 1000;
    scan();
    expect(callback).not.toHaveBeenCalled();
  });

  it("responds to disabled, fps and callback changes", async () => {
    const callback = vi.fn();
    await mount({ disabled: true, fps: 1, onBarcodeScanned: callback });
    scan();
    expect(native.scan).not.toHaveBeenCalled();
    await act(async () => renderer!.update(React.createElement(Probe, { fps: 20, onBarcodeScanned: callback })));
    scan();
    now += 50;
    const replacement = vi.fn();
    await act(async () => renderer!.update(React.createElement(Probe, { fps: 20, onBarcodeScanned: replacement })));
    scan();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  it("disposes frames after errors and closes the detector on unmount", async () => {
    const onError = vi.fn();
    await mount({ onBarcodeScanned: vi.fn(), onError });
    native.scan.mockImplementation(() => { throw new Error("detector failed"); });
    scan();
    expect(onError.mock.calls[0][0].message).toContain("detector failed");
    const lastOnFrame = native.onFrame!;
    await act(async () => renderer!.unmount());
    renderer = undefined;
    expect(native.close).toHaveBeenCalledOnce();
    const input = frame();
    lastOnFrame(input);
    expect(input.dispose).toHaveBeenCalledOnce();
    expect(native.scan).toHaveBeenCalledOnce();
  });
});
