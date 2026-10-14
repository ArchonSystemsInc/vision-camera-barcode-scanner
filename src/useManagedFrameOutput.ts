import { useEffect, useMemo } from "react";
import {
  VisionCamera,
  type Frame,
  type Size,
} from "react-native-vision-camera";
import { provider } from "react-native-vision-camera-worklets";

/** Own callback lifetime: V5.2.3's useFrameOutput does not unregister on cleanup. */
export function useManagedFrameOutput({
  targetResolution,
  onFrame,
}: {
  targetResolution: Size;
  onFrame: (frame: Frame) => void;
}) {
  const output = useMemo(
    () =>
      VisionCamera.createFrameOutput({
        targetResolution,
        pixelFormat: "yuv",
        dropFramesWhileBusy: true,
        enablePhysicalBufferRotation: false,
        enableCameraMatrixDelivery: false,
        enablePreviewSizedOutputBuffers: false,
        allowDeferredStart: true,
      }),
    [targetResolution],
  );
  const runtime = useMemo(
    () => provider.createRuntimeForThread(output.thread),
    [output],
  );
  useEffect(() => {
    runtime.setOnFrameCallback(output, onFrame);
    // Queued on the same native thread as installation and detection. This also
    // orders Strict Mode cleanup/setup and callback replacements correctly.
    return () => runtime.setOnFrameCallback(output, undefined);
  }, [output, runtime, onFrame]);
  return output;
}
