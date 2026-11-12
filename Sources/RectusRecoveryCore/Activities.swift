import Foundation

// MARK: - Activity categories

public enum BaselineAccess: String, Codable, Sendable {
    /// May be logged from day one (comfortable walking, supported ankle mobility).
    case permittedLogging
    /// May be documented as an activity, but the app never presents it as
    /// prescribed or medically cleared (supported upper-body exercise).
    case documentOnly
    /// Locked until a documented clinician authorization exists.
    case requiresClinicalAuthorization
}

public enum ActivityCategory: String, Codable, CaseIterable, Sendable, Comparable, Identifiable {
    public var id: String { rawValue }
    case comfortableWalking
    case supportedAnkleMobility
    case supportedUpperBody

    case gentleIsometrics
    case controlledHipKneeStrengthening
    case hipFlexorStrengthening
    case progressiveLowerBodyResistance
    case stationaryCycling
    case outdoorCycling
    case runningProgression
    case dynamicKettlebell
    case soccerSpecific

    public var baselineAccess: BaselineAccess {
        switch self {
        case .comfortableWalking, .supportedAnkleMobility: return .permittedLogging
        case .supportedUpperBody: return .documentOnly
        default: return .requiresClinicalAuthorization
        }
    }

    public var displayName: String {
        switch self {
        case .comfortableWalking: return "Comfortable walking"
        case .supportedAnkleMobility: return "Gentle supported ankle mobility"
        case .supportedUpperBody: return "Supported upper-body exercise"
        case .gentleIsometrics: return "Gentle isometric strengthening"
        case .controlledHipKneeStrengthening: return "Controlled hip and knee strengthening"
        case .hipFlexorStrengthening: return "Hip-flexor strengthening"
        case .progressiveLowerBodyResistance: return "Progressive lower-body resistance"
        case .stationaryCycling: return "Stationary cycling"
        case .outdoorCycling: return "Outdoor cycling"
        case .runningProgression: return "Running progression"
        case .dynamicKettlebell: return "Dynamic kettlebell exercises"
        case .soccerSpecific: return "Soccer-specific movement (incl. kicking)"
        }
    }

    public static var restricted: [ActivityCategory] {
        allCases.filter { $0.baselineAccess == .requiresClinicalAuthorization }
    }

    public static func < (lhs: ActivityCategory, rhs: ActivityCategory) -> Bool {
        allCases.firstIndex(of: lhs)! < allCases.firstIndex(of: rhs)!
    }
}

// MARK: - Functional assessments

public enum FunctionalTest: String, Codable, CaseIterable, Sendable {
    case walkingWithoutLimp
    case painFreeStraightLegRaise
    case fullPainFreeHipKneeRange
    case painFreeIsometricHipFlexion
    case singleLegSquatControl
    case strengthSymmetry
    case hopTestSymmetry
    case painFreeSprinting

    public var displayName: String {
        switch self {
        case .walkingWithoutLimp: return "Walking without limp"
        case .painFreeStraightLegRaise: return "Pain-free straight-leg raise"
        case .fullPainFreeHipKneeRange: return "Full, pain-free hip and knee range of motion"
        case .painFreeIsometricHipFlexion: return "Pain-free isometric hip flexion"
        case .singleLegSquatControl: return "Single-leg squat control"
        case .strengthSymmetry: return "Hip-flexor / knee-extensor strength symmetry (clinician-set target)"
        case .hopTestSymmetry: return "Hop test symmetry (clinician-set target)"
        case .painFreeSprinting: return "Pain-free graded sprinting"
        }
    }
}

public struct FunctionalAssessment: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var test: FunctionalTest
    public var date: Date
    public var passed: Bool
    public var assessedBy: String
    public var result: String

    public init(id: UUID = UUID(), test: FunctionalTest, date: Date, passed: Bool,
                assessedBy: String, result: String = "") {
        self.id = id
        self.test = test
        self.date = date
        self.passed = passed
        self.assessedBy = assessedBy
        self.result = result
    }
}

// MARK: - Progression rules
// ASSUMPTION: these default prerequisites and functional tests are app
// defaults to structure the conversation with the clinician. They are not
// clinical guidance. They are injectable so a clinician's plan can replace them.

public struct ProgressionRule: Codable, Equatable, Sendable {
    public var category: ActivityCategory
    public var prerequisites: [ActivityCategory]
    public var requiredAssessments: [FunctionalTest]

    public init(category: ActivityCategory, prerequisites: [ActivityCategory], requiredAssessments: [FunctionalTest]) {
        self.category = category
        self.prerequisites = prerequisites
        self.requiredAssessments = requiredAssessments
    }
}

public struct ProgressionRules: Codable, Equatable, Sendable {
    public var rules: [ActivityCategory: ProgressionRule]
    /// A check-in must exist within this many hours to count as a
    /// current, favorable symptom response.
    public var symptomRecencyHours: Double
    /// Consecutive stable check-ins that release a non-urgent hold.
    public var stableCheckInsToReleaseHold: Int

    public func rule(for c: ActivityCategory) -> ProgressionRule {
        rules[c] ?? ProgressionRule(category: c, prerequisites: [], requiredAssessments: [])
    }

    public static let defaults = ProgressionRules(
        rules: Dictionary(uniqueKeysWithValues: [
            // The orthopedic exam that approves isometrics is itself the assessment.
            ProgressionRule(category: .gentleIsometrics, prerequisites: [], requiredAssessments: []),
            ProgressionRule(category: .controlledHipKneeStrengthening, prerequisites: [.gentleIsometrics],
                            requiredAssessments: [.walkingWithoutLimp, .painFreeStraightLegRaise]),
            ProgressionRule(category: .hipFlexorStrengthening, prerequisites: [.gentleIsometrics],
                            requiredAssessments: [.painFreeIsometricHipFlexion]),
            ProgressionRule(category: .progressiveLowerBodyResistance, prerequisites: [.controlledHipKneeStrengthening],
                            requiredAssessments: [.fullPainFreeHipKneeRange, .singleLegSquatControl]),
            ProgressionRule(category: .stationaryCycling, prerequisites: [],
                            requiredAssessments: [.walkingWithoutLimp]),
            ProgressionRule(category: .outdoorCycling, prerequisites: [.stationaryCycling],
                            requiredAssessments: [.singleLegSquatControl]),
            ProgressionRule(category: .runningProgression, prerequisites: [.progressiveLowerBodyResistance],
                            requiredAssessments: [.strengthSymmetry, .hopTestSymmetry]),
            ProgressionRule(category: .dynamicKettlebell, prerequisites: [.progressiveLowerBodyResistance],
                            requiredAssessments: [.singleLegSquatControl, .strengthSymmetry]),
            ProgressionRule(category: .soccerSpecific, prerequisites: [.runningProgression, .hipFlexorStrengthening],
                            requiredAssessments: [.strengthSymmetry, .hopTestSymmetry, .painFreeSprinting]),
        ].map { ($0.category, $0) }),
        symptomRecencyHours: 72,
        stableCheckInsToReleaseHold: 3
    )
}

/// Documented completion of a prerequisite stage.
public struct PrerequisiteCompletion: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var category: ActivityCategory
    public var completedOn: Date
    public var documentedBy: String
    public var note: String

    public init(id: UUID = UUID(), category: ActivityCategory, completedOn: Date, documentedBy: String, note: String = "") {
        self.id = id
        self.category = category
        self.completedOn = completedOn
        self.documentedBy = documentedBy
        self.note = note
    }
}

// MARK: - Exercises and authorizations

public struct ApprovedExercise: Codable, Equatable, Hashable, Sendable {
    public var name: String
    /// Dose exactly as written by the clinician (sets, reps, effort, range).
    public var parameters: String

    public init(name: String, parameters: String) {
        self.name = name
        self.parameters = parameters
    }
}

public struct ClinicalAuthorization: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var category: ActivityCategory
    /// Only these exercises become available. An empty list means the
    /// clinician approved the category but listed no exercises: nothing unlocks.
    public var approvedExercises: [ApprovedExercise]
    public var attestation: ClinicianAttestation
    public var effectiveFrom: Date
    public var expiresOn: Date?
    public var revokedOn: Date?
    public var revocationReason: String?

    public init(id: UUID = UUID(), category: ActivityCategory, approvedExercises: [ApprovedExercise],
                attestation: ClinicianAttestation, effectiveFrom: Date, expiresOn: Date? = nil) {
        self.id = id
        self.category = category
        self.approvedExercises = approvedExercises
        self.attestation = attestation
        self.effectiveFrom = effectiveFrom
        self.expiresOn = expiresOn
    }

    public func isActive(on date: Date) -> Bool {
        if date < effectiveFrom { return false }
        if let e = expiresOn, date > e { return false }
        if let r = revokedOn, date >= r { return false }
        return true
    }
}

// MARK: - Activity log

public enum ActivitySource: String, Codable, Sendable { case manual }

public struct ActivityLogEntry: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var date: Date
    public var category: ActivityCategory
    public var exerciseName: String
    public var durationMinutes: Int
    public var notes: String
    public var source: ActivitySource

    public init(id: UUID = UUID(), date: Date, category: ActivityCategory, exerciseName: String,
                durationMinutes: Int, notes: String = "", source: ActivitySource = .manual) {
        self.id = id
        self.date = date
        self.category = category
        self.exerciseName = exerciseName
        self.durationMinutes = durationMinutes
        self.notes = notes
        self.source = source
    }

    /// Upper-body work is documented, never framed as prescribed.
    public var isDocumentationOnly: Bool { category.baselineAccess == .documentOnly }
}

// MARK: - Exercise library (demonstrations, priority 8)
// Descriptions are placeholders until the treating clinician supplies
// their own. The library never makes an exercise available on its own.

public struct LibraryExercise: Codable, Equatable, Sendable {
    public var name: String
    public var category: ActivityCategory
    public var demonstration: String
}

public enum ExerciseLibrary {
    public static let all: [LibraryExercise] = [
        .init(name: "Comfortable walk", category: .comfortableWalking, demonstration: "Flat ground, normal pace, stop before limping."),
        .init(name: "Seated ankle pumps", category: .supportedAnkleMobility, demonstration: "Seated, leg supported; move ankle up and down slowly."),
        .init(name: "Seated ankle circles", category: .supportedAnkleMobility, demonstration: "Seated, leg supported; slow circles each direction."),
        .init(name: "Quadriceps set", category: .gentleIsometrics, demonstration: "Lying, knee straight; gently tighten thigh, hold, relax."),
        .init(name: "Gluteal squeeze", category: .gentleIsometrics, demonstration: "Lying; squeeze buttocks gently, hold, relax."),
        .init(name: "Isometric hip adduction (ball squeeze)", category: .gentleIsometrics, demonstration: "Lying, knees bent; gently squeeze a soft ball."),
        .init(name: "Isometric hip abduction", category: .gentleIsometrics, demonstration: "Lying, knees bent with band; press gently outward."),
        .init(name: "Isometric hip flexion", category: .gentleIsometrics, demonstration: "Only if specifically approved — loads the injured tendon directly."),
        .init(name: "Stationary bike", category: .stationaryCycling, demonstration: "Seat height, resistance and duration exactly as cleared."),
    ]

    public static func exercises(in category: ActivityCategory) -> [LibraryExercise] {
        all.filter { $0.category == category }
    }
}
