package com.margelo.nitro.archon.barcodescanner

import android.graphics.PixelFormat
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions as MLScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode as MLBarcode
import com.google.mlkit.vision.common.InputImage
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import com.margelo.nitro.core.ArrayBuffer
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.ReentrantLock

/** Matches the V5 ML Kit scanner's model, options and input-image paths. */
class HybridBarcodeScanner(options: BarcodeScannerOptions) : HybridBarcodeScannerSpec() {
  private val closed = AtomicBoolean(false)
  private val released = AtomicBoolean(false)
  private val scanLock = ReentrantLock()
  private val scanner = run {
    require(options.barcodeFormats.isNotEmpty()) { "barcodeFormats must not be empty" }
    val formats = options.barcodeFormats.map { target ->
      if (target == TargetBarcodeFormat.ALL_FORMATS) MLBarcode.FORMAT_ALL_FORMATS
      else formatPairs.first { it.first.name == target.name }.second
    }
    BarcodeScanning.getClient(MLScannerOptions.Builder()
      .setBarcodeFormats(formats.first(), *formats.drop(1).toIntArray()).build())
  }

  override fun scanCodes(frame: HybridFrameSpec, regionOfInterest: Rect?): Array<Barcode> {
    scanLock.lock()
    try {
      if (closed.get()) return emptyArray()
      return scanOpenFrame(frame)
    } finally {
      scanLock.unlock()
      if (closed.get()) close()
    }
  }

  @OptIn(ExperimentalGetImage::class)
  private fun scanOpenFrame(frame: HybridFrameSpec): Array<Barcode> {
    val nativeFrame = frame as? NativeFrame ?: error("Frame is not a NativeFrame")
    val image = nativeFrame.image
    val rotation = image.imageInfo.rotationDegrees
    val input = if (image.format == PixelFormat.RGBA_8888) {
      InputImage.fromBitmap(image.toBitmap(), rotation)
    } else {
      InputImage.fromMediaImage(image.image ?: error("Frame has no underlying Image"), rotation)
    }
    return Tasks.await(scanner.process(input)).map { code ->
      // ML Kit reports upright (rotation-applied) coordinates. CameraX's
      // sensorToBufferTransformMatrix expects raw buffer coordinates instead.
      fun toBuffer(x: Double, y: Double): Point = when (rotation) {
        90 -> Point(y, image.height - x)
        180 -> Point(image.width - x, image.height - y)
        270 -> Point(image.width - y, x)
        else -> Point(x, y)
      }
      val corners = code.cornerPoints?.map { toBuffer(it.x.toDouble(), it.y.toDouble()) }.orEmpty()
      val box = code.boundingBox
      val boxPoints = if (box == null) corners else listOf(
        toBuffer(box.left.toDouble(), box.top.toDouble()),
        toBuffer(box.right.toDouble(), box.top.toDouble()),
        toBuffer(box.right.toDouble(), box.bottom.toDouble()),
        toBuffer(box.left.toDouble(), box.bottom.toDouble()),
      )
      Barcode(
        format = formatPairs.firstOrNull { it.second == code.format }?.first ?: BarcodeFormat.UNKNOWN,
        boundingBox = Rect(
          boxPoints.minOfOrNull { it.x } ?: 0.0,
          boxPoints.maxOfOrNull { it.x } ?: 0.0,
          boxPoints.minOfOrNull { it.y } ?: 0.0,
          boxPoints.maxOfOrNull { it.y } ?: 0.0,
        ),
        cornerPoints = corners.toTypedArray(),
        displayValue = code.displayValue,
        rawBytes = code.rawBytes?.let { ArrayBuffer.copy(it) },
        rawValue = code.rawValue,
        valueType = valueTypes[code.valueType] ?: BarcodeValueType.UNKNOWN,
      )
    }.toTypedArray()
  }

  override fun close() {
    closed.set(true)
    // The active scan releases the detector if we cannot acquire it immediately.
    if (scanLock.tryLock()) {
      try {
        releaseScanner()
      } finally {
        scanLock.unlock()
      }
    }
  }

  private fun releaseScanner() {
    if (released.compareAndSet(false, true)) scanner.close()
  }

  override fun convertFramePointToCameraPoint(frame: HybridFrameSpec, point: Point): Point {
    val converted = frame.convertFramePointToCameraPoint(com.margelo.nitro.camera.Point(point.x, point.y))
    return Point(converted.x, converted.y)
  }

  override fun dispose() {
    close()
    super.dispose()
  }

  companion object {
    private val formatPairs = listOf(
      BarcodeFormat.CODE_128 to MLBarcode.FORMAT_CODE_128,
      BarcodeFormat.CODE_39 to MLBarcode.FORMAT_CODE_39,
      BarcodeFormat.CODE_93 to MLBarcode.FORMAT_CODE_93,
      BarcodeFormat.CODABAR to MLBarcode.FORMAT_CODABAR,
      BarcodeFormat.DATA_MATRIX to MLBarcode.FORMAT_DATA_MATRIX,
      BarcodeFormat.EAN_13 to MLBarcode.FORMAT_EAN_13,
      BarcodeFormat.EAN_8 to MLBarcode.FORMAT_EAN_8,
      BarcodeFormat.ITF to MLBarcode.FORMAT_ITF,
      BarcodeFormat.QR_CODE to MLBarcode.FORMAT_QR_CODE,
      BarcodeFormat.UPC_A to MLBarcode.FORMAT_UPC_A,
      BarcodeFormat.UPC_E to MLBarcode.FORMAT_UPC_E,
      BarcodeFormat.PDF_417 to MLBarcode.FORMAT_PDF417,
      BarcodeFormat.AZTEC to MLBarcode.FORMAT_AZTEC,
    )
    private val valueTypes = mapOf(
      MLBarcode.TYPE_CONTACT_INFO to BarcodeValueType.CONTACT_INFO,
      MLBarcode.TYPE_EMAIL to BarcodeValueType.EMAIL,
      MLBarcode.TYPE_ISBN to BarcodeValueType.ISBN,
      MLBarcode.TYPE_PHONE to BarcodeValueType.PHONE,
      MLBarcode.TYPE_PRODUCT to BarcodeValueType.PRODUCT,
      MLBarcode.TYPE_SMS to BarcodeValueType.SMS,
      MLBarcode.TYPE_TEXT to BarcodeValueType.TEXT,
      MLBarcode.TYPE_URL to BarcodeValueType.URL,
      MLBarcode.TYPE_WIFI to BarcodeValueType.WIFI,
      MLBarcode.TYPE_GEO to BarcodeValueType.GEO,
      MLBarcode.TYPE_CALENDAR_EVENT to BarcodeValueType.CALENDAR_EVENT,
      MLBarcode.TYPE_DRIVER_LICENSE to BarcodeValueType.DRIVER_LICENSE,
    )
  }
}
