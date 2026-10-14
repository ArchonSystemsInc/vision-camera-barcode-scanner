import CoreGraphics

enum BarcodeDetectionRegion {
  static func normalized(_ region: CGRect, width: Double, height: Double) -> CGRect? {
    guard width.isFinite, height.isFinite, width > 0, height > 0,
          [region.minX, region.minY, region.width, region.height].allSatisfy({ $0.isFinite }),
          region.width > 0, region.height > 0 else { return nil }
    // Preserve quiet zones at the viewfinder edge; exact visibility is checked after detection.
    let padded = region.insetBy(dx: -max(32, region.width * 0.1), dy: -max(32, region.height * 0.1))
    let clipped = padded.intersection(CGRect(x: 0, y: 0, width: width, height: height))
    guard !clipped.isNull, !clipped.isEmpty else { return nil }
    return CGRect(x: clipped.minX / width, y: 1 - clipped.maxY / height,
                  width: clipped.width / width, height: clipped.height / height)
  }
}
