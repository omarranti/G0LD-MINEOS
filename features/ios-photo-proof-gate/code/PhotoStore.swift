import UIKit

/// Local-only photo persistence for proof shots. Filename contract: the photo
/// for an entry is always "<entryID>.jpg", so the data model only needs to
/// store the filename string (or nothing at all, if you can derive the UUID).
@MainActor
enum PhotoStore {
    static var directory: URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("proof-photos", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func save(_ image: UIImage, for entryID: UUID) -> String? {
        let filename = "\(entryID.uuidString).jpg"
        let resized = image.resizedToFit(maxDimension: 1200)
        guard let data = resized.jpegData(compressionQuality: 0.8) else { return nil }
        do {
            try data.write(to: directory.appendingPathComponent(filename))
            return filename
        } catch {
            return nil
        }
    }

    static func load(_ filename: String) -> UIImage? {
        UIImage(contentsOfFile: directory.appendingPathComponent(filename).path)
    }
}

extension UIImage {
    func resizedToFit(maxDimension: CGFloat) -> UIImage {
        let largest = max(size.width, size.height)
        guard largest > maxDimension else { return self }
        let scaleFactor = maxDimension / largest
        let newSize = CGSize(width: size.width * scaleFactor, height: size.height * scaleFactor)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
