// swift-tools-version:5.9
import PackageDescription

// RectusRecoveryCore holds all clinical rules (gating, symptoms, timeline,
// HealthKit import model). It depends only on Foundation so the safety logic
// can be tested on any platform, including CI on Linux.
// The SwiftUI + HealthKit app lives in App/ and links this package.
let package = Package(
    name: "RectusRecovery",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "RectusRecoveryCore", targets: ["RectusRecoveryCore"]),
    ],
    targets: [
        .target(name: "RectusRecoveryCore"),
        .testTarget(name: "RectusRecoveryCoreTests", dependencies: ["RectusRecoveryCore"]),
    ]
)
