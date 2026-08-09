import SwiftUI

/// Location picker for the home chip. Mirrors the Yelp/Uber-Eats/Deliveroo
/// pattern: "Use my current location" on top, then the curated city list with
/// the active choice check-marked. Selecting a city pins it (persists +
/// re-anchors content); "use current location" resumes auto-tracking.
struct LocationPickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        model.useCurrentLocation()
                        dismiss()
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "location.fill")
                                .foregroundStyle(Color.accentColor)
                            Text("Use my current location")
                                .foregroundStyle(.primary)
                            Spacer()
                            if model.preferredCity == nil {
                                Image(systemName: "checkmark")
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                } footer: {
                    Text("Tracks where you are and shows the nearest community.")
                }

                Section("Cities") {
                    ForEach(SupportedCity.all) { city in
                        Button {
                            model.selectCity(city)
                            dismiss()
                        } label: {
                            HStack {
                                Text(city.label)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if model.preferredCity?.slug == city.slug {
                                    Image(systemName: "checkmark")
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(Color.accentColor)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
