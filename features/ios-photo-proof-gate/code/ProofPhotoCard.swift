import SwiftUI
import PhotosUI
import AVFoundation

/// Card that gates "today's proof": prompts for a live camera shot, runs it
/// through the verifier, and shows the verified badge once attached.
///
/// External contracts to satisfy in the destination app:
/// - `viewModel.todayPhotoFilename: String?`   (persisted filename, PhotoStore contract)
/// - `viewModel.todayPhotoVerified: Bool`      (classifier verdict for today's photo)
/// - `viewModel.attachPhotoToToday(_ image: UIImage) async`
///   (saves via PhotoStore, runs ProofVerifier, awards whatever reward you use)
/// - `Theme.*` design tokens (restyle natively; see SPEC "Structure to keep, skin to drop")
struct ProofPhotoCard: View {
    @Bindable var viewModel: ProofViewModel
    @State private var pickedItem: PhotosPickerItem?
    @State private var showCamera: Bool = false
    @State private var isProcessing: Bool = false
    @State private var cameraDenied: Bool = false
    @Environment(\.scenePhase) private var scenePhase

    private var cameraAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    var body: some View {
        Group {
            if let filename = viewModel.todayPhotoFilename, let image = PhotoStore.load(filename) {
                photoPreview(image)
            } else {
                addProofPrompt
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                Task { await process(image) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: pickedItem) { _, newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await process(image)
                }
                pickedItem = nil
            }
        }
        .onAppear {
            refreshCameraDenied()
        }
        .onChange(of: scenePhase) { _, phase in
            // Recheck after a round-trip to Settings
            if phase == .active {
                refreshCameraDenied()
            }
        }
    }

    private func refreshCameraDenied() {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        cameraDenied = status == .denied || status == .restricted
    }

    private func openCameraRespectingPermission() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            showCamera = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted {
                        showCamera = true
                    } else {
                        cameraDenied = true
                    }
                }
            }
        default:
            cameraDenied = true
        }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    private var addProofPrompt: some View {
        HStack(spacing: 14) {
            Text("📸")
                .font(.system(size: 32))

            VStack(alignment: .leading, spacing: 4) {
                Text("Add today's proof")
                    .font(.system(.subheadline, design: .serif, weight: .bold))
                    .foregroundStyle(Theme.textPrimary)
                Text(cameraDenied
                     ? "Camera access is off. Enable it in Settings to add proof."
                     : "Snap your proof. Bonus reward if it verifies.")
                    .font(.system(.caption, design: .default))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()

            if isProcessing {
                SwiftUI.ProgressView()
                    .tint(Theme.accent)
            } else {
                // Live camera only: proof means a photo taken right now, not a
                // gallery upload. The library path exists solely for the
                // camera-less simulator (dev + UI tests).
                HStack(spacing: 8) {
                    if cameraAvailable && cameraDenied {
                        Button {
                            openSettings()
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "camera.badge.ellipsis")
                                    .font(.caption)
                                Text("Enable")
                                    .font(.system(.caption, design: .default, weight: .bold))
                            }
                            .foregroundStyle(Theme.background)
                            .padding(.horizontal, 12)
                            .frame(height: 40)
                            .background(Theme.warm, in: Capsule())
                        }
                        .accessibilityIdentifier("proof-camera-settings")
                    } else if cameraAvailable {
                        Button {
                            openCameraRespectingPermission()
                        } label: {
                            Image(systemName: "camera.fill")
                                .font(.body)
                                .foregroundStyle(Theme.background)
                                .frame(width: 40, height: 40)
                                .background(Theme.accent, in: Circle())
                        }
                        .accessibilityIdentifier("proof-camera")
                    }

                    #if targetEnvironment(simulator)
                    PhotosPicker(selection: $pickedItem, matching: .images) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.body)
                            .foregroundStyle(cameraAvailable ? Theme.accent : Theme.background)
                            .frame(width: 40, height: 40)
                            .background(
                                cameraAvailable ? Theme.accent.opacity(0.15) : Theme.accent,
                                in: Circle()
                            )
                    }
                    .accessibilityIdentifier("proof-picker")
                    #endif
                }
            }
        }
        .padding(18)
        .background(Theme.surface, in: .rect(cornerRadius: Theme.cardRadius))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.cardRadius)
                .stroke(Theme.accent.opacity(0.15), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
        }
    }

    private func photoPreview(_ image: UIImage) -> some View {
        ZStack(alignment: .bottomLeading) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(height: 180)
                .frame(maxWidth: .infinity)
                .clipShape(.rect(cornerRadius: Theme.cardRadius))

            LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .center, endPoint: .bottom)
                .clipShape(.rect(cornerRadius: Theme.cardRadius))

            HStack(spacing: 6) {
                if viewModel.todayPhotoVerified {
                    Label("Verified", systemImage: "checkmark.seal.fill")
                        .font(.system(.caption, design: .default, weight: .bold))
                        .foregroundStyle(Theme.accent)
                } else {
                    Label("Today's proof", systemImage: "camera.fill")
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(12)
        }
    }

    private func process(_ image: UIImage) async {
        isProcessing = true
        await viewModel.attachPhotoToToday(image)
        isProcessing = false
    }
}

/// Thin UIImagePickerController wrapper for a live camera capture.
struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker

        init(_ parent: CameraPicker) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.onCapture(image)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
