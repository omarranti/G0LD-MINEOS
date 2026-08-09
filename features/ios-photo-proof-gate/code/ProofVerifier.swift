import UIKit
import Vision
import CoreML

/// On-device photo verification: does this image contain evidence of the
/// real-world action we asked the user to perform?
///
/// The identifier set below is the domain swap point. The origin app verified
/// "did you actually go outside", so it matches Vision's outdoor-scene labels.
/// Replace the set (and the doc comment) with the labels that prove YOUR action:
/// food labels for a cooking habit, "book"/"page" for reading, "gym"/"dumbbell"
/// for workouts, etc. Dump VNClassifyImageRequest results on a few real photos
/// first; the taxonomy is large (~1300 labels) and lowercased substring matching
/// against it is deliberately loose.
enum ProofVerifier {
    private static let targetIdentifiers: Set<String> = [
        "grass", "lawn", "plant", "tree", "sky", "outdoor", "vegetation",
        "park", "garden", "foliage", "field", "flower", "leaf", "nature",
        "forest", "meadow", "shrub", "moss", "landscape", "beach", "sand",
        "snow", "mountain", "cloud", "sun", "water", "lake", "river",
    ]

    /// On-device Vision classification: does this photo look like the target scene?
    static func matchesTarget(_ image: UIImage) async -> Bool {
        guard let cgImage = image.cgImage else { return false }
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let request = VNClassifyImageRequest()
                #if targetEnvironment(simulator)
                // The simulator can't create Vision's neural inference context; CPU works.
                if #available(iOS 17.0, *) {
                    if let cpu = MLComputeDevice.allComputeDevices.first(where: {
                        if case .cpu = $0 { return true } else { return false }
                    }) {
                        request.setComputeDevice(cpu, for: .main)
                    }
                } else {
                    request.usesCPUOnly = true
                }
                #endif
                let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                do {
                    try handler.perform([request])
                    let observations = request.results ?? []
                    let matched = observations.contains { observation in
                        observation.confidence > 0.1 &&
                        targetIdentifiers.contains { observation.identifier.lowercased().contains($0) }
                    }
                    continuation.resume(returning: matched)
                } catch {
                    print("ProofVerifier error: \(error)")
                    continuation.resume(returning: false)
                }
            }
        }
    }
}
