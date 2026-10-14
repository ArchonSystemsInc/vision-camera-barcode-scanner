import CoreGraphics

@main
struct BarcodeDetectionRegionTests {
  static func main() {
    let full = BarcodeDetectionRegion.normalized(CGRect(x: 0, y: 0, width: 1920, height: 1080), width: 1920, height: 1080)
    precondition(full == CGRect(x: 0, y: 0, width: 1, height: 1))
    let cropped = BarcodeDetectionRegion.normalized(CGRect(x: 100, y: 200, width: 200, height: 100), width: 1000, height: 1000)!
    precondition(abs(cropped.minX - 0.068) < 0.000001)
    precondition(abs(cropped.minY - 0.668) < 0.000001)
    precondition(abs(cropped.width - 0.264) < 0.000001)
    precondition(abs(cropped.height - 0.164) < 0.000001)
    let edge = BarcodeDetectionRegion.normalized(CGRect(x: 0, y: 0, width: 100, height: 100), width: 1000, height: 1000)!
    precondition(edge.minX == 0 && edge.maxY == 1)
    precondition(BarcodeDetectionRegion.normalized(.zero, width: 1000, height: 1000) == nil)
    precondition(BarcodeDetectionRegion.normalized(CGRect(x: 2000, y: 0, width: 10, height: 10), width: 1000, height: 1000) == nil)
    print("Barcode detection region tests passed")
  }
}
