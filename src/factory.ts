import { NitroModules } from "react-native-nitro-modules";
import type {
  ArchonBarcodeScannerFactory,
  BarcodeScannerOptions,
} from "./specs/BarcodeScanner.nitro";

export function createBarcodeScanner(options: BarcodeScannerOptions) {
  if (options.barcodeFormats.length === 0)
    throw new Error("barcodeFormats must not be empty");
  return NitroModules.createHybridObject<ArchonBarcodeScannerFactory>(
    "ArchonBarcodeScannerFactory",
  ).createBarcodeScanner(options);
}
