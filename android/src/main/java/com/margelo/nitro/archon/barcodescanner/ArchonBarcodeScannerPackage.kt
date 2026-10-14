package com.margelo.nitro.archon.barcodescanner

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

class ArchonBarcodeScannerPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null
  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider { HashMap() }
  companion object {
    init { ArchonBarcodeScannerOnLoad.initializeNative() }
  }
}
