import AVFoundation
import NitroModules
import Vision
import VisionCamera

final class HybridBarcodeScanner: HybridBarcodeScannerSpec {
  private let request: VNDetectBarcodesRequest
  private let formats: [TargetBarcodeFormat]
  private let frameOutput: AVCaptureVideoDataOutput?
  private let lock = NSLock()
  private let stateLock = NSLock()
  private var closed = false

  init(options: BarcodeScannerOptions) throws {
    guard !options.barcodeFormats.isEmpty else {
      throw RuntimeError.error(withMessage: "barcodeFormats must not be empty")
    }
    formats = options.barcodeFormats
    frameOutput = (options.frameOutput as? any NativeCameraOutput)?.output as? AVCaptureVideoDataOutput
    request = VNDetectBarcodesRequest()
    super.init()
    let all = formats.contains(.allFormats)
    request.symbologies = try request.supportedSymbologies().filter { symbology in
      guard let target = Self.targetFormat(symbology) else { return false }
      return all || formats.contains(target) || (symbology == .ean13 && formats.contains(.upcA))
    }
    guard !request.symbologies.isEmpty else {
      throw RuntimeError.error(withMessage: "None of the requested barcode formats are supported by Apple Vision on this OS")
    }
  }

  func scanCodes(frame: any HybridFrameSpec, regionOfInterest: Rect?) throws -> [Barcode] {
    guard let nativeFrame = frame as? any NativeFrame, let buffer = nativeFrame.sampleBuffer,
          let pixels = CMSampleBufferGetImageBuffer(buffer) else {
      throw RuntimeError.error(withMessage: "Frame has no valid pixel buffer")
    }
    // Keep Vision in raw buffer axes. Conversion to sensor coordinates below
    // uses the real output connection, not device-relative Frame.orientation.
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
    lock.lock()
    defer { lock.unlock() }
    stateLock.lock()
    let isClosed = closed
    stateLock.unlock()
    if isClosed { return [] }
    let width = Double(CVPixelBufferGetWidth(pixels))
    let height = Double(CVPixelBufferGetHeight(pixels))
    if let regionOfInterest {
      guard let frameOutput, frameOutput.connection(with: .video) != nil else {
        throw RuntimeError.error(withMessage: "A connected frameOutput is required for a detection region")
      }
      let sensorRegion = CGRect(x: regionOfInterest.left, y: regionOfInterest.top,
                                width: regionOfInterest.right - regionOfInterest.left,
                                height: regionOfInterest.bottom - regionOfInterest.top)
      let bufferRegion = frameOutput.outputRectConverted(fromMetadataOutputRect: sensorRegion)
      guard let region = BarcodeDetectionRegion.normalized(bufferRegion, width: width, height: height) else {
        return []
      }
      request.regionOfInterest = region
    } else {
      request.regionOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
    }
    try handler.perform([request])
    return (request.results ?? []).compactMap { observation in
      guard let target = Self.targetFormat(observation.symbology) else { return nil }
      var format = Self.resultFormat(target)
      var value = observation.payloadStringValue
      // Apple reports UPC-A as EAN-13 with a leading zero.
      if target == .ean13, let payload = value, payload.count == 13, payload.hasPrefix("0"),
         formats.contains(.allFormats) || formats.contains(.upcA) {
        format = .upcA
        value = String(payload.dropFirst())
      } else if target == .ean13 && !formats.contains(.allFormats) && !formats.contains(.ean13) {
        return nil
      }
      func point(_ p: CGPoint) -> Point {
        Point(x: p.x * width, y: (1 - p.y) * height)
      }
      let corners = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft].map(point)
      return Barcode(
        format: format,
        boundingBox: Rect(left: corners.map(\.x).min()!, right: corners.map(\.x).max()!,
                          top: corners.map(\.y).min()!, bottom: corners.map(\.y).max()!),
        cornerPoints: corners,
        displayValue: value,
        rawBytes: nil,
        rawValue: value,
        valueType: .unknown
      )
    }
  }

  func convertFramePointToCameraPoint(frame: any HybridFrameSpec, point: Point) throws -> Point {
    guard let frameOutput, frameOutput.connection(with: .video) != nil,
          frame.isValid, frame.width > 0, frame.height > 0 else {
      throw RuntimeError.error(withMessage: "A connected frameOutput and valid frame are required for coordinate conversion")
    }
    // AVCaptureVideoDataOutput coordinates are buffer PIXELS. The conversion
    // itself normalizes them into metadata's fixed, unrotated sensor axes, like
    // AVCaptureVideoPreviewLayer.layerPointConverted(fromCaptureDevicePoint:).
    // Frame.orientation is relative to the target device orientation instead;
    // using it here wrongly rotates coordinates when the UI is rotation-locked.
    let outputPoint = CGRect(x: point.x, y: point.y, width: 0, height: 0)
    let sensorPoint = frameOutput.metadataOutputRectConverted(fromOutputRect: outputPoint)
    return Point(x: sensorPoint.midX, y: sensorPoint.midY)
  }

  func close() {
    // Never wait for Vision on the caller (normally the JS thread).
    // An in-flight call retains the request until it finishes.
    stateLock.lock()
    defer { stateLock.unlock() }
    closed = true
  }

  private static func targetFormat(_ symbology: VNBarcodeSymbology) -> TargetBarcodeFormat? {
    switch symbology {
    case .aztec: return .aztec
    case .code128: return .code128
    case .code39, .code39Checksum, .code39FullASCII, .code39FullASCIIChecksum: return .code39
    case .code93, .code93i: return .code93
    case .dataMatrix: return .dataMatrix
    case .ean13: return .ean13
    case .ean8: return .ean8
    case .i2of5, .i2of5Checksum, .itf14: return .itf
    case .qr: return .qrCode
    case .upce: return .upcE
    case .pdf417: return .pdf417
    default:
      if #available(iOS 15.0, *), symbology == .codabar { return .codabar }
      return nil
    }
  }

  private static func resultFormat(_ target: TargetBarcodeFormat) -> BarcodeFormat {
    switch target {
    case .aztec: return .aztec
    case .code128: return .code128
    case .code39: return .code39
    case .code93: return .code93
    case .codabar: return .codabar
    case .dataMatrix: return .dataMatrix
    case .ean13: return .ean13
    case .ean8: return .ean8
    case .itf: return .itf
    case .qrCode: return .qrCode
    case .upcA: return .upcA
    case .upcE: return .upcE
    case .pdf417: return .pdf417
    case .allFormats: return .unknown
    }
  }
}
