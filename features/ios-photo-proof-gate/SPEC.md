# iOS Photo Proof Gate (on-device Vision verification)

> Verify that a user actually did the real-world thing they claim, from a live camera photo, entirely on device, with zero server cost and zero photo upload.

<!-- Structure over skin: the value is the verify-store-permission pipeline, not the card styling. -->

- **Slug:** `ios-photo-proof-gate`
- **Tags:** `vision, on-device-ml, camera, photo, permissions, gamification, habit, privacy`
- **Source project:** habit iOS app
- **Stack:** SwiftUI + Vision (`VNClassifyImageRequest`) + PhotosUI, iOS 17+
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** working build (unreleased app), covered by an integration test

## Problem it solves
Habit and accountability apps live or die on whether the check-in is honest. A bare "I did it" button is free to lie to. Server-side photo verification costs money per photo, adds latency, and forces you to upload user photos (privacy policy, storage, moderation). This pattern gets a meaningful honesty bump for free: the built-in Vision scene classifier runs on device, the photo never leaves the phone, and the reward system can pay out a bonus only when the classifier agrees the scene matches.

## When to reach for this
- Any "prove you did X with a photo" mechanic: went outside, cooked a meal, hit the gym, read a book, walked the dog.
- You want photo proof but cannot justify a backend (cost, privacy, App Store review simplicity: no account, no upload).
- You need a camera-permission flow that recovers gracefully after the user denies access and later flips it back on in Settings.
- You need photos persisted locally with a contract simple enough that the data model stores one string.

## How it works
1. **Live camera only.** Proof means a photo taken right now. The card offers `UIImagePickerController` camera capture; the photo-library path is compiled in only for the simulator (`#if targetEnvironment(simulator)`) so dev and UI tests work on machines without a camera.
2. **Classify on device.** `ProofVerifier.matchesTarget(_:)` runs `VNClassifyImageRequest` on a background queue and returns true if any observation with confidence > 0.1 case-insensitively substring-matches a curated identifier set. The set is the domain swap point (the origin shipped outdoor-scene labels).
3. **Simulator CPU fallback.** The simulator cannot create Vision's neural inference context. Inside the simulator conditional, iOS 17+ pins the request to a CPU compute device via `MLComputeDevice`; earlier OSes use the deprecated `usesCPUOnly`. Without this the classifier throws on every simulator run.
4. **Store small, name by contract.** `PhotoStore` resizes to fit 1200px on the long edge, writes JPEG at 0.8 quality into `Documents/proof-photos/`, and names the file `<entryID>.jpg`. The stable UUID filename means the rest of the app persists only a filename string and can always re-derive the path.
5. **Permission state machine that self-heals.** The card tracks `cameraDenied` from `AVCaptureDevice.authorizationStatus`. Denied state swaps the camera button for an "Enable" button that deep-links to Settings, and `scenePhase == .active` re-checks the status so the UI recovers the moment the user returns from Settings. `.notDetermined` requests access inline and opens the camera on grant.
6. **Verification is a bonus, not a wall.** The origin attaches the photo either way and stores a `verified` flag; only the extra reward is gated on the classifier. That keeps false negatives (night shots, weird angles) from punishing honest users.

## Data model
Stateless services plus two fields on whatever your per-day entry record is:
```
Entry   photoFilename: String?    // "<entryID>.jpg" written by PhotoStore
        photoVerified: Bool       // ProofVerifier verdict at attach time
```
Files live in `Documents/proof-photos/`; nothing is synced or uploaded.

## Key decisions & gotchas
- **The simulator trap (the expensive one).** `VNClassifyImageRequest` fails on the simulator with an inference-context error unless you force CPU. The fix is version-gated: `MLComputeDevice` pinning on iOS 17+, `usesCPUOnly` before that. Without it every simulator run and UI test silently fails verification.
- **Loose matching on purpose.** Confidence floor 0.1 plus substring matching over a broad identifier set. Vision's taxonomy is large and inconsistent ("lawn", "grassland", "seagrass"); precise equality matching misses obvious positives. Tune with the test's raw-observation dump, not by guessing.
- **Never a server round-trip.** The entire pipeline is offline. This is a product stance (privacy, zero marginal cost) and a review stance (no data collection to declare for the photo).
- **Resize before write.** A raw 48MP HEIC-to-JPEG would be several MB per day. 1200px at 0.8 quality is ~150 to 300KB and indistinguishable in a card-sized preview.
- **Deliberately not handled:** EXIF timestamp or GPS checks (spoofable and permission-heavy), defeating a photo-of-a-photo, re-verification of old photos after identifier-set changes, and iCloud backup exclusion (proof photos do ride along in device backups).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/ProofVerifier.swift` | Vision classification against the identifier set, with the simulator CPU-device fallback | the `targetIdentifiers` set (your domain) |
| `code/PhotoStore.swift` | Resize-to-1200 / JPEG-0.8 documents-directory store with the `<entryID>.jpg` filename contract | none |
| `code/ProofPhotoCard.swift` | The card: camera-permission state machine (scenePhase re-check), live capture, simulator-only library picker, verified badge; plus `CameraPicker` wrapper | `ProofViewModel` (3-member contract in the header comment), `Theme.*` tokens |
| `code/ProofVerifierTests.swift` | Integration test against real Vision with a fixture photo and a raw-observation diagnostics dump for tuning the set | test fixture image, app module name |

## Structure to keep, skin to drop
- **Keep (the idea):** the on-device classify-with-confidence-floor gate, the identifier-set-as-domain-config shape, the simulator CPU fallback, the resize-then-store filename contract, the denied-then-Settings-then-scenePhase-recheck permission machine, the live-camera-only stance with simulator-only library escape hatch, verification as bonus not wall.
- **Drop (regenerate natively):** all card styling (dashed border, gradient scrim, capsule badges, serif fonts, emoji), the `Theme.*` token values, the prompt and badge copy, the 180pt preview height, and the reward wording. The origin's set of outdoor identifiers is also skin: it only makes sense if your domain is "outside".

## Adaptation notes
- Add `NSCameraUsageDescription` to Info.plist or the camera path crashes on first request.
- Replace `targetIdentifiers` with labels for your domain, then run the test with a real fixture photo and read the `/tmp` diagnostics dump to tune the set and floor.
- Implement the `ProofViewModel` contract (`todayPhotoFilename`, `todayPhotoVerified`, `attachPhotoToToday`): save via `PhotoStore.save(_:for:)`, call `ProofVerifier.matchesTarget`, persist both fields, award your bonus on verified.
- `@Bindable` assumes an `@Observable` view model (iOS 17+). On older targets swap to `ObservableObject`.
- Rename the `App` module in the test's `@testable import` and bundle your fixture image in the test target.

## Provenance
- Origin files: `ios/<app>/Services/GrassVerifier.swift`, `ios/<app>/Services/PhotoStore.swift`, `ios/<app>/Views/ProofPhotoCard.swift`, `ios/<app>Tests/GrassVerifierTests.swift` @ 2026-08-08 (habit iOS app, working build). Genericized for this library: `GrassVerifier` renamed `ProofVerifier` (its `outdoorIdentifiers` renamed `targetIdentifiers`, `looksOutdoors` renamed `matchesTarget`), `GrassViewModel` renamed `ProofViewModel`, `GrassTheme` renamed `Theme`, test class renamed `ProofVerifierTests` with the app module import genericized to `App`; app-specific copy (XP amounts, "outside" wording) softened; an unrelated streak-pass info sheet that lived in the same origin file was removed. Control flow and thresholds are intact.
- Related features: [[ios-hold-to-confirm-ritual]]
- Related memory: none
