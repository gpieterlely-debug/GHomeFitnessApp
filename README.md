# GHomeFitnessApp — Rectus Recovery

A recovery management app for a rectus femoris tendon injury. **Clinician authorization** controls which activities are permitted. **Symptoms** guide monitoring. Apple Health data is tracked for context **only**.

- Specification: [`docs/SPEC.md`](docs/SPEC.md) (v2.1)
- Clinical rules (tested): `Sources/RectusRecoveryCore`
- iOS app (SwiftUI + HealthKit): `App/`

## Run the tests

On a Mac with Xcode 16+ or Swift 6:

```bash
swift test
```

On Linux, without Swift installed:

```bash
docker run --rm -v "$PWD":/work -w /work swift:6.0-noble swift test --scratch-path /tmp/build
```

## Build the iOS app (Mac only)

```bash
brew install xcodegen
```

```bash
cd App && xcodegen && open RectusRecovery.xcodeproj
```

Set your signing team in Xcode. HealthKit needs a real device for meaningful data.

> This app records clinical decisions. It does not diagnose, clear, or prescribe.
