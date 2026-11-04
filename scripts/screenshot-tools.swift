import AppKit

let redLightPoint = 16
let minimumRedLightTint = 60
let tolerance = 2

func imageAt(_ path: String) -> NSBitmapImageRep {
  NSBitmapImageRep(data: FileManager.default.contents(atPath: path)!)!
}

func printWindowId(pid: Int32) {
  let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
  let window = windows.first {
    $0[kCGWindowOwnerPID as String] as? Int32 == pid && $0[kCGWindowLayer as String] as? Int == 0
  }
  if let window { print(window[kCGWindowNumber as String]!) }
}

func hasFocusedChrome(_ path: String, scale: Int) -> Bool {
  let image = imageAt(path)
  let redLightPixel = redLightPoint * scale
  let offset = redLightPixel * image.bytesPerRow + redLightPixel * image.samplesPerPixel
  let (red, blue) = (Int(image.bitmapData![offset]), Int(image.bitmapData![offset + 2]))
  return red - blue >= minimumRedLightTint
}

func isSameImage(_ firstPath: String, _ secondPath: String) -> Bool {
  let (first, second) = (imageAt(firstPath), imageAt(secondPath))
  let size = first.bytesPerRow * first.pixelsHigh
  guard size == second.bytesPerRow * second.pixelsHigh else { return false }
  let firstPixels = UnsafeBufferPointer(start: first.bitmapData!, count: size)
  let secondPixels = UnsafeBufferPointer(start: second.bitmapData!, count: size)
  return zip(firstPixels, secondPixels).allSatisfy { abs(Int($0) - Int($1)) <= tolerance }
}

let arguments = CommandLine.arguments
switch arguments[1] {
case "window-id": printWindowId(pid: Int32(arguments[2])!)
case "scale": print(Int(NSScreen.main!.backingScaleFactor))
case "has-focused-chrome": exit(hasFocusedChrome(arguments[2], scale: Int(arguments[3])!) ? 0 : 1)
case "is-same": exit(isSameImage(arguments[2], arguments[3]) ? 0 : 1)
default: exit(2)
}
