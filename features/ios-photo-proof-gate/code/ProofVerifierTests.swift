import XCTest
import Vision
@testable import App // swap for your app module

/// Integration test against the real Vision classifier, with a diagnostics dump.
/// Bundle a known-good fixture photo (here "grass.jpg", a lawn shot) in the test
/// target and assert the verifier accepts it. The raw-observation dump to /tmp is
/// the fastest way to tune your identifier set: run once, read the top labels,
/// adjust the set, repeat.
final class ProofVerifierTests: XCTestCase {
    func testVisionClassifiesFixturePhotoAsTarget() async throws {
        var diag = ""
        let url = try XCTUnwrap(Bundle(for: ProofVerifierTests.self).url(forResource: "grass", withExtension: "jpg"))
        let image = try XCTUnwrap(UIImage(contentsOfFile: url.path))
        let cgImage = try XCTUnwrap(image.cgImage)

        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            let top = (request.results ?? []).filter { $0.confidence > 0.05 }.prefix(15)
            let summary = top.map { "\($0.identifier)=\(String(format: "%.2f", $0.confidence))" }.joined(separator: ", ")
            diag += "VISION_RAW: count=\(request.results?.count ?? -1) top=[\(summary)]\n"
        } catch {
            diag += "VISION_RAW_ERROR: \(error)\n"
        }

        let verified = await ProofVerifier.matchesTarget(image)
        diag += "VERIFIER_RESULT: \(verified)\n"
        try? diag.write(toFile: "/tmp/proof_vision_diag.txt", atomically: true, encoding: .utf8)
        XCTAssertTrue(verified, "the fixture photo should classify as the target scene")
    }
}
