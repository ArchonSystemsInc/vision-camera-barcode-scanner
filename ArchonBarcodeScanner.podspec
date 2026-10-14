require "json"
package = JSON.parse(File.read(File.join(__dir__, "package.json")))
Pod::Spec.new do |s|
  s.name = "ArchonBarcodeScanner"
  s.version = package["version"]
  s.summary = package["description"]
  s.homepage = package["homepage"]
  s.license = package["license"]
  s.authors = package["author"]
  s.platforms = { :ios => 15.5 }
  s.source = { :git => "https://github.com/ArchonSystemsInc/vision-camera-barcode-scanner.git", :tag => s.version.to_s }
  s.source_files = "ios/**/*.swift"
  s.frameworks = ["AVFoundation", "Vision"]
  load 'nitrogen/generated/ios/ArchonBarcodeScanner+autolinking.rb'
  add_nitrogen_files(s)
  s.dependency 'VisionCamera'
  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
