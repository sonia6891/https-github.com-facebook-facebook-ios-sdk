// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MeowStoreKitSmoke",
    platforms: [.macOS(.v15)],
    targets: [
        .target(name: "MeowStoreKitSmokeSupport"),
        .testTarget(
            name: "MeowStoreKitSmokeTests",
            dependencies: ["MeowStoreKitSmokeSupport"]
        )
    ]
)
