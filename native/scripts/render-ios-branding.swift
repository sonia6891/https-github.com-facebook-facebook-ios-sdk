import AppKit
import Foundation

enum BrandingError: Error {
    case sourceMissing(String)
    case bitmapCreationFailed
    case pngEncodingFailed
}

func color(hex: Int) -> NSColor {
    NSColor(
        calibratedRed: CGFloat((hex >> 16) & 0xff) / 255.0,
        green: CGFloat((hex >> 8) & 0xff) / 255.0,
        blue: CGFloat(hex & 0xff) / 255.0,
        alpha: 1.0
    )
}

func renderSquare(
    sourcePath: String,
    destinationPath: String,
    pixels: Int,
    background: NSColor,
    artworkScale: CGFloat
) throws {
    guard let source = NSImage(contentsOfFile: sourcePath) else {
        throw BrandingError.sourceMissing(sourcePath)
    }
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: pixels,
        pixelsHigh: pixels,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: false,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        throw BrandingError.bitmapCreationFailed
    }

    guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw BrandingError.bitmapCreationFailed
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high

    let canvas = NSRect(x: 0, y: 0, width: pixels, height: pixels)
    background.setFill()
    NSBezierPath(rect: canvas).fill()

    let side = CGFloat(pixels) * artworkScale
    let target = NSRect(
        x: (CGFloat(pixels) - side) / 2,
        y: (CGFloat(pixels) - side) / 2,
        width: side,
        height: side
    )
    source.draw(
        in: target,
        from: NSRect(origin: .zero, size: source.size),
        operation: .sourceOver,
        fraction: 1.0
    )
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw BrandingError.pngEncodingFailed
    }
    try data.write(to: URL(fileURLWithPath: destinationPath), options: .atomic)
}

let cwd = FileManager.default.currentDirectoryPath
let source = URL(fileURLWithPath: cwd).appendingPathComponent("../app-icon-v115-512.png").standardized.path
let appIcon = URL(fileURLWithPath: cwd).appendingPathComponent("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png").path
let splashDir = URL(fileURLWithPath: cwd).appendingPathComponent("ios/App/App/Assets.xcassets/Splash.imageset").path

try renderSquare(
    sourcePath: source,
    destinationPath: appIcon,
    pixels: 1024,
    background: .white,
    artworkScale: 1.0
)

let splashPath = URL(fileURLWithPath: splashDir).appendingPathComponent("splash-2732x2732.png").path
try renderSquare(
    sourcePath: source,
    destinationPath: splashPath,
    pixels: 2732,
    background: color(hex: 0xFFF8EF),
    artworkScale: 0.34
)

for name in ["splash-2732x2732-1.png", "splash-2732x2732-2.png"] {
    let target = URL(fileURLWithPath: splashDir).appendingPathComponent(name)
    try? FileManager.default.removeItem(at: target)
    try FileManager.default.copyItem(at: URL(fileURLWithPath: splashPath), to: target)
}

print("Rendered Meow Work App Store icon and warm launch artwork.")
