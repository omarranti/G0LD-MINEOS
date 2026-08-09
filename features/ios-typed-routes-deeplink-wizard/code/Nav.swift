import SwiftUI

/// Typed navigation routes for the push stacks: ONE enum, ONE switch, and every
/// screen in the app becomes deep-linkable by constructing a value.
///
/// Associated values are lightweight identifiers (slugs / ids), never model
/// objects, so a Route can be built from anywhere (a tap, a push notification,
/// a universal link) without loading data first. Screens with entry presets
/// (like `.book`) take optionals so the same screen serves cold entry and
/// preconfigured entry.
enum Route: Hashable {
    case service(String)     // slug
    case member(String)      // slug
    case book(service: String?, clinician: String?)
    case match(concern: String?)
    case ask(persona: String?, concern: String?, fromCheck: Bool)
    case report(String)      // report id
    case messages            // secure patient portal messaging channel
    case exercises           // prescribed-care library
    case exercise(String)    // exercise id
    case journal             // journal list
    case journalNew          // journal composer
    case checkin             // daily mood check-in
    case safety              // crisis hub
    case safetyPlan(String)  // patient id
    case family              // family / dependents list
    case familyMember(String) // family member id
    case services
    case team
    case pricing
    case contact
    case organizations
    case profile
    case staff
    case staffPatient(String)
    case staffPlatform
    case staffCompliance
    case about
    case staffAppointments
    case staffClinicians
    case staffIntake
    case staffScheduling
    case staffNote(String)   // patient slug, scribe note editor
    case desk                // front desk / reception day sheet
    case deskPayments        // desk payments + end-of-day reconciliation
    case school              // referral dashboard for partner schools
    case schoolRefer         // structured refer-a-child intake
    case schoolReferral(String) // referral id, the report bridge
}

/// Attach the shared destinations to a NavigationStack root. Every tab's stack
/// gets the SAME registry via `.withRoutes()`, so any screen can push any
/// other screen with `NavigationLink(value: Route...)` or path.append.
struct RouteDestinations: ViewModifier {
    func body(content: Content) -> some View {
        content.navigationDestination(for: Route.self) { route in
            switch route {
            case .service(let slug): ServiceDetailView(slug: slug)
            case .member(let slug): MemberDetailView(slug: slug)
            case .book(let s, let c): BookView(presetService: s, presetClinician: c)
            case .match(let concern): MatchView(concern: concern)
            case .ask(let p, let c, let fc): AskView(presetPersona: p, presetConcern: c, fromCheck: fc)
            case .report(let rid): ReportView(id: rid)
            case .messages: MessagesView()
            case .exercises: ExerciseLibraryView()
            case .exercise(let id): ExerciseDetailView(exerciseId: id)
            case .journal: JournalView()
            case .journalNew: JournalComposerView()
            case .checkin: CheckInView()
            case .safety: SafetyView()
            case .safetyPlan(let id): SafetyPlanView(patientId: id)
            case .family: FamilyView()
            case .familyMember(let id): FamilyMemberView(memberId: id)
            case .services: ServicesListView()
            case .team: TeamListView()
            case .pricing: PricingView()
            case .contact: ContactView()
            case .organizations: OrganizationsView()
            case .profile: ProfileView()
            case .staff: StaffHomeView()
            case .staffPatient(let id): StaffPatientView(patientId: id)
            case .staffPlatform: StaffPlatformView()
            case .staffCompliance: StaffComplianceView()
            case .about: AboutView()
            case .staffAppointments: StaffAppointmentsView()
            case .staffClinicians: StaffCliniciansView()
            case .staffIntake: StaffIntakeView()
            case .staffScheduling: StaffSchedulingView()
            case .staffNote(let id): ScribeNoteView(patientId: id)
            case .desk: DeskView()
            case .deskPayments: DeskPaymentsView()
            case .school: SchoolView()
            case .schoolRefer: SchoolReferView()
            case .schoolReferral(let rid): SchoolReferralDetailView(id: rid)
            }
        }
    }
}

extension View {
    func withRoutes() -> some View { modifier(RouteDestinations()) }
}

/// Small helpers used across screens.
func openURLString(_ s: String) {
    if let url = URL(string: s) { UIApplication.shared.open(url) }
}
func callNumber(_ tel: String) { openURLString("tel:\(tel)") }
