package com.margelo.nitro.archon.barcodescanner

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

@Keep
@DoNotStrip
class HybridBarcodeScannerFactory : HybridArchonBarcodeScannerFactorySpec() {
  override fun createBarcodeScanner(options: BarcodeScannerOptions): HybridBarcodeScannerSpec = HybridBarcodeScanner(options)
}
