import SwiftUI

// TRIMMED EXCERPT of the origin booking wizard. Kept: the entry-preset init
// that computes the starting step, wasPushed back-button semantics, the
// backward-only stepper, the FocusState field enum, step-keyed transitions,
// and the flow skeleton. Trimmed: most per-step visual detail. `lang.t(en, ar)`
// is the origin's bilingual helper (English/Arabic); swap for your own
// localization or plain strings.
//
// NOTE ON STEP 4 (PAY): the origin's payment step is a SIMULATED CONCEPT
// PREVIEW. It fakes processing with DispatchQueue.asyncAfter, touches no PSP,
// charges nothing, and stores no card data (and says so in its own UI). It is
// kept here as REFERENCE ONLY for where a payment step sits in the flow. Do
// not reuse it as a payment pattern; integrate a real PSP SDK at that slot.

private let TIMES = ["09:00", "11:30", "14:00", "16:30"]

/// Multi-step booking flow: Service, Clinician, Time, Details, Pay, then success.
/// Used both as a root tab (`BookView()`) and pushed mid-flow via
/// `Route.book(service:clinician:)` from detail pages.
struct BookView: View {
    @EnvironmentObject var lang: LangState
    @Environment(\.dismiss) private var dismiss

    let presetService: String?
    let presetClinician: String?

    @State private var step: Int
    @State private var serviceSlug: String?
    @State private var clinicianSlug: String?
    @State private var selectedDate: Date?
    @State private var selectedTime: String?
    @State private var name = ""
    @State private var phone = ""
    @State private var note = ""
    @State private var wasPushed: Bool
    @State private var days: [Date] = BookView.makeDays()

    // Reference-only simulated payment state (see file header note).
    private enum PayMethod { case card, applepay }
    @State private var payMethod: PayMethod = .card
    @State private var cardNumber = ""
    @State private var cardExp = ""
    @State private var cardCVC = ""
    @State private var paying = false

    /// One enum for every focusable field in the wizard; a single @FocusState
    /// drives keyboard dismissal (`focused = nil`) on step changes.
    private enum FieldID { case name, phone, note, cardNumber, cardExp, cardCVC }
    @FocusState private var focused: FieldID?

    /// Entry presets decide where the wizard STARTS. Pushed from a clinician
    /// page: skip to Time (step 2). Pushed from a service page: skip to
    /// Clinician (step 1). Opened cold (the tab): start at Service (step 0).
    /// `wasPushed` remembers which world we are in so the back button can
    /// dismiss instead of stepping past the preset.
    init(presetService: String? = nil, presetClinician: String? = nil) {
        self.presetService = presetService
        self.presetClinician = presetClinician
        if let c = presetClinician, let m = memberBySlug(c) {
            _clinicianSlug = State(initialValue: m.slug)
            let s = presetService.flatMap { m.services.contains($0) ? $0 : nil }
            _serviceSlug = State(initialValue: s ?? m.services.first)
            _step = State(initialValue: 2)
            _wasPushed = State(initialValue: true)
        } else if let s = presetService, serviceBySlug(s) != nil {
            _serviceSlug = State(initialValue: s)
            _step = State(initialValue: 1)
            _wasPushed = State(initialValue: true)
        } else {
            _step = State(initialValue: 0)
            _serviceSlug = State(initialValue: nil)
            _clinicianSlug = State(initialValue: nil)
            _wasPushed = State(initialValue: false)
        }
    }

    // MARK: derived

    private var service: Service? { serviceSlug.flatMap(serviceBySlug) }
    private var clinician: Member? { clinicianSlug.flatMap(memberBySlug) }

    /// Clinician list is filtered by the chosen service, falling back to the
    /// full team so a preset never strands the user on an empty step.
    private var clinicians: [Member] {
        guard let service else { return TEAM }
        let matched = TEAM.filter { $0.services.contains(service.slug) }
        return matched.isEmpty ? TEAM : matched
    }

    private var stepLabels: [String] {
        [lang.t("Service", "الخدمة"), lang.t("Clinician", "الأخصائي"), lang.t("Time", "الموعد"),
         lang.t("Details", "بياناتك"), lang.t("Pay", "الدفع")]
    }
    private var canConfirm: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && !phone.trimmingCharacters(in: .whitespaces).isEmpty }

    // Pricing sourced from the shared PRICING table so booking and the pricing
    // screen never drift.
    private var priceBand: PriceBand? { service.flatMap { PRICING[$0.slug] } }
    private var amount: Double { priceBand?.cash ?? 700 }

    private var showBack: Bool { (step > 0 && step < 5) || wasPushed }

    private func goTo(_ s: Int) { withAnimation(.easeInOut(duration: 0.22)) { step = s } }
    private func goBack() {
        focused = nil
        if step > 0 && step < 5 { goTo(step - 1) } else { dismiss() }
    }
    private func reset() {
        serviceSlug = nil; clinicianSlug = nil; selectedDate = nil; selectedTime = nil
        name = ""; phone = ""; note = ""
        payMethod = .card; cardNumber = ""; cardExp = ""; cardCVC = ""; paying = false
        goTo(0)
    }

    // MARK: body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                if step < 5 { stepper.padding(.horizontal, 20).padding(.top, 24) }
                stepBody
                    .padding(.horizontal, 20).padding(.top, 24)
                    // Step-keyed identity: changing `step` swaps the subtree,
                    // so one `.transition` animates every step change.
                    .id(step)
                    .transition(.opacity)
            }
            .padding(.bottom, 60)
        }
        .background(Color.cloud.ignoresSafeArea())
        .scrollIndicators(.hidden)
        .toolbar(.hidden, for: .navigationBar)
        .withRoutes()
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            if showBack {
                Button(action: goBack) {
                    Image(systemName: "chevron.backward").font(.system(size: 20, weight: .semibold))
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(step == 5 ? lang.t("Appointment confirmed", "تم تأكيد الموعد") : lang.t("Book an appointment", "احجز موعداً")).h2()
            }
            Spacer()
            LangToggle()
        }
        .padding(.horizontal, 20).padding(.top, 8)
    }

    /// Numbered stepper. Completed circles are tappable to JUMP BACKWARD only;
    /// current and future steps are disabled, so the stepper can never be used
    /// to skip validation.
    private var stepper: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 0) {
                ForEach(stepLabels.indices, id: \.self) { i in
                    let done = i < step
                    let active = i == step
                    Button {
                        if i < step { goTo(i) }
                    } label: {
                        ZStack {
                            Circle().fill(active ? Color.navy : (done ? Color.mint : Color.mist)).frame(width: 30, height: 30)
                            if done {
                                Image(systemName: "checkmark").font(.system(size: 14, weight: .bold))
                            } else {
                                Text("\(i + 1)").font(.system(size: 13, weight: .bold))
                            }
                        }
                    }
                    .disabled(i >= step)
                    if i < stepLabels.count - 1 {
                        Rectangle().fill(i < step ? Color.mint : Color.blueLine).frame(height: 2).frame(maxWidth: .infinity)
                    }
                }
            }
            Text("\(lang.t("Step \(step + 1) of 5", "الخطوة \(step + 1) من 5")) · \(stepLabels[min(step, 4)])")
                .font(.system(size: 13))
        }
    }

    @ViewBuilder private var stepBody: some View {
        switch step {
        case 0: serviceStep
        case 1: clinicianStep
        case 2: timeStep
        case 3: detailsStep
        case 4: payStep
        default: successStep
        }
    }

    // MARK: step 0 - service (selection card list; selecting auto-advances)

    private var serviceStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(lang.t("What do you need?", "ما الذي تحتاجه؟")).h3()
            ForEach(SERVICES) { s in
                Button {
                    // Changing service invalidates the clinician choice.
                    serviceSlug = s.slug; clinicianSlug = nil; goTo(1)
                } label: {
                    // Origin: selectable card with icon, title, description.
                    Text(s.title.s(lang.isArabic))
                }
            }
        }
    }

    // MARK: step 1 - clinician (filtered by service; selecting auto-advances)

    private var clinicianStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(lang.t("Choose a clinician", "اختر أخصائياً")).h3()
            ForEach(clinicians) { m in
                Button {
                    clinicianSlug = m.slug; goTo(2)
                } label: {
                    // Origin: avatar card with role and spoken languages.
                    Text(m.name)
                }
            }
        }
    }

    // MARK: step 2 - time (date strip gates the slot grid)

    private var timeStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(lang.t("Pick a time", "اختر موعداً")).h3()

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(days, id: \.self) { d in
                        let sel = selectedDate == d
                        Button { selectedDate = d } label: {
                            Text(dayLabel(d)).fontWeight(sel ? .bold : .regular)
                        }
                    }
                }
            }

            HStack(spacing: 8) {
                ForEach(TIMES, id: \.self) { tm in
                    Chip(label: tm, selected: selectedTime == tm && selectedDate != nil) {
                        // Slots are inert until a date is chosen.
                        if selectedDate != nil { selectedTime = tm }
                    }
                }
            }
            if selectedDate == nil {
                Text(lang.t("Choose a date to see times.", "اختر تاريخاً لرؤية الأوقات.")).font(.system(size: 13))
            }

            let ready = selectedDate != nil && selectedTime != nil
            PillButton(title: lang.t("Continue", "متابعة"), fullWidth: true) { if ready { goTo(3) } }
                .opacity(ready ? 1 : 0.4)
        }
    }

    // MARK: step 3 - details (shared field builder + FocusState)

    private var detailsStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(lang.t("Your details", "بياناتك")).h3()
            field(lang.t("Full name", "الاسم الكامل"), text: $name, id: .name)
            field(lang.t("Phone (WhatsApp)", "الهاتف (واتساب)"), text: $phone, id: .phone, keyboard: .phonePad)
            field(lang.t("Anything we should know? (optional)", "أي شيء نحتاج معرفته؟ (اختياري)"), text: $note, id: .note, multiline: true)
            PillButton(title: lang.t("Continue to payment", "متابعة للدفع"), fullWidth: true) { if canConfirm { focused = nil; goTo(4) } }
                .opacity(canConfirm ? 1 : 0.4)
        }
    }

    /// One field builder for every input in the wizard; the FieldID + FocusState
    /// pair gives active-field styling and programmatic keyboard dismissal.
    @ViewBuilder
    private func field(_ label: String, text: Binding<String>, id: FieldID, keyboard: UIKeyboardType = .default, multiline: Bool = false) -> some View {
        let active = focused == id
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.system(size: 13, weight: .medium))
            Group {
                if multiline {
                    TextField("", text: text, axis: .vertical).lineLimit(3...6)
                } else {
                    TextField("", text: text).keyboardType(keyboard)
                }
            }
            .focused($focused, equals: id)
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(active ? Color.white : Color.cloud)
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(active ? Color.blue : Color.blueLine, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: step 4 - pay. REFERENCE ONLY: simulated concept preview, no PSP.
    // The origin UI itself discloses "Concept preview · you won't be charged ·
    // no card data stored". Replace this whole step with a real payment SDK.

    private var payStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(lang.t("Secure payment", "الدفع الآمن")).h3()

            // Order summary from the shared pricing table (kept: prevents drift).
            Text("\(service?.title.s(lang.isArabic) ?? "") · AED \(Int(amount))")

            // Pay-method toggle + card fields reuse the same field builder.
            HStack(spacing: 10) {
                payMethodButton(.card, label: lang.t("Card", "بطاقة"))
                payMethodButton(.applepay, label: "Apple Pay")
            }
            if payMethod == .card {
                field(lang.t("Card number", "رقم البطاقة"), text: $cardNumber, id: .cardNumber, keyboard: .numberPad)
                HStack(spacing: 14) {
                    field(lang.t("Expiry", "الانتهاء"), text: $cardExp, id: .cardExp, keyboard: .numbersAndPunctuation)
                    field(lang.t("CVC", "رمز التحقق"), text: $cardCVC, id: .cardCVC, keyboard: .numberPad)
                }
            }

            // SIMULATED processing: asyncAfter, then jump to success. Not a
            // payment pattern. A real integration replaces this action.
            Button {
                focused = nil
                paying = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.3) {
                    paying = false
                    goTo(5)
                }
            } label: {
                Text(paying ? lang.t("Processing…", "جارٍ المعالجة…") : lang.t("Pay AED \(Int(amount))", "ادفع \(Int(amount)) درهم"))
            }
            .disabled(paying)

            Text(lang.t("Concept preview · you won't be charged · no card data stored",
                        "معاينة تصوّرية · لن تُخصم أي مبالغ · لا تُحفظ بيانات البطاقة"))
                .font(.system(size: 12))
        }
    }

    private func payMethodButton(_ m: PayMethod, label: String) -> some View {
        Button { payMethod = m } label: {
            Text(label).fontWeight(payMethod == m ? .bold : .regular)
        }
    }

    // MARK: step 5 - success (recap + reset for another booking)

    private var successStep: some View {
        VStack(spacing: 12) {
            Text(lang.t("You're all set", "تم حجز موعدك")).h2()
            // Origin: summary card (name / service / clinician / when / paid),
            // WhatsApp contact card, and an emergency disclaimer.
            summaryRow(lang.t("Service", "الخدمة"), service?.title.s(lang.isArabic) ?? "-")
            summaryRow(lang.t("Clinician", "الأخصائي"), clinician?.name ?? lang.t("Any clinician", "أي أخصائي"))
            summaryRow(lang.t("When", "متى"), whenText, last: true)
            PillButton(title: lang.t("Book another", "احجز موعداً آخر"), variant: .outline, fullWidth: true, action: reset)
        }
    }

    // MARK: helpers

    private var whenText: String {
        let day = selectedDate.map(dayLabel) ?? ""
        return "\(day) · \(selectedTime ?? "")"
    }

    private func summaryRow(_ label: String, _ value: String, last: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
            Spacer(minLength: 12)
            Text(value).fontWeight(.semibold)
        }
    }

    /// Localized day labels; formatter locale follows the language toggle.
    private func dayLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: lang.isArabic ? "ar_AE" : "en_GB")
        f.setLocalizedDateFormatFromTemplate("EEE d MMM")
        return f.string(from: date)
    }

    /// Next 7 bookable days, skipping the clinic's closed weekday.
    private static func makeDays() -> [Date] {
        var out: [Date] = []
        let cal = Calendar.current
        var d = cal.startOfDay(for: Date())
        while out.count < 7 {
            d = cal.date(byAdding: .day, value: 1, to: d) ?? d
            if cal.component(.weekday, from: d) == 6 { continue } // closed on Friday
            out.append(d)
        }
        return out
    }
}
