import NitroModules

final class HybridBarcodeScannerFactory: HybridArchonBarcodeScannerFactorySpec {
  func createBarcodeScanner(options: BarcodeScannerOptions) throws -> any HybridBarcodeScannerSpec {
    return try HybridBarcodeScanner(options: options)
  }
}
