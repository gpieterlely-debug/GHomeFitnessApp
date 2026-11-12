import Foundation

// MARK: - Clinical phases (never advanced automatically)

public enum ClinicalPhase: String, Codable, CaseIterable, Sendable {
    case protection
    case earlyLoading
    case strengthening
    case returnToActivity
    case returnToSport

    public var displayName: String {
        switch self {
        case .protection: return "Protection"
        case .earlyLoading: return "Early loading"
        case .strengthening: return "Strengthening"
        case .returnToActivity: return "Return to activity"
        case .returnToSport: return "Return to sport"
        }
    }
}

public struct PhaseChange: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var phase: ClinicalPhase
    public var effectiveDate: Date
    public var attestation: ClinicianAttestation

    public init(id: UUID = UUID(), phase: ClinicalPhase, effectiveDate: Date, attestation: ClinicianAttestation) {
        self.id = id
        self.phase = phase
        self.effectiveDate = effectiveDate
        self.attestation = attestation
    }
}

// MARK: - Orthopedic assessment form

public enum SurgeryDecision: String, Codable, CaseIterable, Sendable {
    case notAddressed, notRequired, recommended, undecidedFurtherImaging, referredToSurgeon
}

public enum WeightBearing: String, Codable, CaseIterable, Sendable {
    case notAddressed, fullWeightBearing, asTolerated, partial, nonWeightBearing
}

public enum CyclingClearance: String, Codable, CaseIterable, Sendable {
    case notAddressed, notCleared, stationaryOnly, stationaryAndOutdoor
}

/// A category the clinician explicitly approved in writing, beyond the
/// structured isometric and cycling fields.
public struct CategoryApproval: Codable, Equatable, Sendable {
    public var category: ActivityCategory
    public var exercises: [ApprovedExercise]
    public var expiresOn: Date?

    public init(category: ActivityCategory, exercises: [ApprovedExercise], expiresOn: Date? = nil) {
        self.category = category
        self.exercises = exercises
        self.expiresOn = expiresOn
    }
}

public struct OrthopedicAssessment: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var attestation: ClinicianAttestation
    public var tearLocation: String?
    public var tendonInvolvement: String?
    public var retractionOrGap: String?
    public var surgery: SurgeryDecision
    public var weightBearing: WeightBearing
    public var weightBearingNotes: String?
    public var approvedRangeOfMotion: String?
    public var approvedIsometrics: [ApprovedExercise]
    public var cyclingClearance: CyclingClearance
    public var cyclingConditions: String?
    public var strengthTrainingRestrictions: String?
    public var physiotherapyReferral: Bool?
    public var followUpDate: Date?
    public var treatmentPathway: TreatmentPathway?
    public var additionalApprovals: [CategoryApproval]

    public init(id: UUID = UUID(), attestation: ClinicianAttestation, tearLocation: String? = nil,
                tendonInvolvement: String? = nil, retractionOrGap: String? = nil,
                surgery: SurgeryDecision = .notAddressed, weightBearing: WeightBearing = .notAddressed,
                weightBearingNotes: String? = nil, approvedRangeOfMotion: String? = nil,
                approvedIsometrics: [ApprovedExercise] = [], cyclingClearance: CyclingClearance = .notAddressed,
                cyclingConditions: String? = nil, strengthTrainingRestrictions: String? = nil,
                physiotherapyReferral: Bool? = nil, followUpDate: Date? = nil,
                treatmentPathway: TreatmentPathway? = nil, additionalApprovals: [CategoryApproval] = []) {
        self.id = id
        self.attestation = attestation
        self.tearLocation = tearLocation
        self.tendonInvolvement = tendonInvolvement
        self.retractionOrGap = retractionOrGap
        self.surgery = surgery
        self.weightBearing = weightBearing
        self.weightBearingNotes = weightBearingNotes
        self.approvedRangeOfMotion = approvedRangeOfMotion
        self.approvedIsometrics = approvedIsometrics
        self.cyclingClearance = cyclingClearance
        self.cyclingConditions = cyclingConditions
        self.strengthTrainingRestrictions = strengthTrainingRestrictions
        self.physiotherapyReferral = physiotherapyReferral
        self.followUpDate = followUpDate
        self.treatmentPathway = treatmentPathway
        self.additionalApprovals = additionalApprovals
    }

    /// Converts only what the clinician explicitly wrote into authorizations.
    /// "Not addressed" fields unlock nothing.
    public func derivedAuthorizations() -> [ClinicalAuthorization] {
        let a = attestation
        var out: [ClinicalAuthorization] = []
        if !approvedIsometrics.isEmpty {
            out.append(ClinicalAuthorization(category: .gentleIsometrics, approvedExercises: approvedIsometrics,
                                             attestation: a, effectiveFrom: a.assessmentDate))
        }
        let bikeDose = ApprovedExercise(name: "Stationary bike", parameters: cyclingConditions ?? "As instructed by clinician")
        switch cyclingClearance {
        case .stationaryOnly:
            out.append(ClinicalAuthorization(category: .stationaryCycling, approvedExercises: [bikeDose],
                                             attestation: a, effectiveFrom: a.assessmentDate))
        case .stationaryAndOutdoor:
            out.append(ClinicalAuthorization(category: .stationaryCycling, approvedExercises: [bikeDose],
                                             attestation: a, effectiveFrom: a.assessmentDate))
            out.append(ClinicalAuthorization(category: .outdoorCycling,
                                             approvedExercises: [ApprovedExercise(name: "Outdoor ride", parameters: cyclingConditions ?? "As instructed by clinician")],
                                             attestation: a, effectiveFrom: a.assessmentDate))
        case .notAddressed, .notCleared:
            break
        }
        for extra in additionalApprovals where extra.category.baselineAccess == .requiresClinicalAuthorization {
            out.append(ClinicalAuthorization(category: extra.category, approvedExercises: extra.exercises,
                                             attestation: a, effectiveFrom: a.assessmentDate, expiresOn: extra.expiresOn))
        }
        return out
    }
}

// MARK: - Appointments

public enum AppointmentKind: String, Codable, CaseIterable, Sendable {
    case orthopedic, physiotherapy, imaging, generalPractice, other
}

public struct ChecklistItem: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var question: String
    public var answer: String?

    public init(id: UUID = UUID(), question: String, answer: String? = nil) {
        self.id = id
        self.question = question
        self.answer = answer
    }
}

public struct Appointment: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var kind: AppointmentKind
    public var title: String
    /// nil = milestone known but not yet booked.
    public var scheduledAt: Date?
    public var clinicianName: String?
    public var reminderOffsetsHours: [Double]
    public var questions: [ChecklistItem]
    public var findingsRecordedAt: Date?

    public init(id: UUID = UUID(), kind: AppointmentKind, title: String, scheduledAt: Date?,
                clinicianName: String? = nil, reminderOffsetsHours: [Double] = [72, 24, 2],
                questions: [ChecklistItem] = [], findingsRecordedAt: Date? = nil) {
        self.id = id
        self.kind = kind
        self.title = title
        self.scheduledAt = scheduledAt
        self.clinicianName = clinicianName
        self.reminderOffsetsHours = reminderOffsetsHours
        self.questions = questions
        self.findingsRecordedAt = findingsRecordedAt
    }

    public func needsFindings(now: Date) -> Bool {
        guard let s = scheduledAt else { return false }
        return s < now && findingsRecordedAt == nil
    }

    public static let orthopedicQuestions: [String] = [
        "Exactly where is the tear (proximal, mid-substance, myotendinous junction; direct or indirect head)?",
        "How much of the tendon is involved, and is there any retraction or gap?",
        "Is surgery an option or recommended? Does waiting change the surgical options or outcome?",
        "Do I need repeat imaging, and when?",
        "What are my weight-bearing instructions? Do I need crutches?",
        "What hip and knee range of motion is allowed, and what should I avoid (e.g., hip extension with knee bend)?",
        "Which isometric exercises may I start, at what effort, sets and holds?",
        "Am I cleared for stationary cycling? If yes: seat height, resistance, duration.",
        "What lower-body strength training is restricted, and until when?",
        "Can I do supported upper-body training, including kettlebell work? Which positions are off-limits?",
        "Will you refer me to physiotherapy? Who and when?",
        "Which symptoms should make me stop and call you?",
        "What functional tests will decide running, kettlebell swings, and kicking?",
        "When is my follow-up, and can I have these restrictions in writing?",
    ]
}

public struct ReminderRequest: Equatable, Sendable {
    public var identifier: String
    public var fireDate: Date
    public var title: String
    public var body: String
}

public enum ReminderPlanner {
    /// Future reminders for booked appointments, plus a findings prompt
    /// 2 hours after each appointment.
    public static func reminders(for appointments: [Appointment], now: Date) -> [ReminderRequest] {
        var out: [ReminderRequest] = []
        for a in appointments {
            guard let s = a.scheduledAt else { continue }
            for h in a.reminderOffsetsHours {
                let fire = s.addingTimeInterval(-h * 3600)
                if fire > now {
                    out.append(ReminderRequest(identifier: "\(a.id)-pre-\(Int(h))", fireDate: fire, title: a.title,
                                               body: "In \(Int(h)) hours. Bring your question checklist and MRI report."))
                }
            }
            let post = s.addingTimeInterval(2 * 3600)
            if post > now && a.findingsRecordedAt == nil {
                out.append(ReminderRequest(identifier: "\(a.id)-findings", fireDate: post, title: "Record specialist findings",
                                           body: "Enter the findings and written restrictions from \(a.title)."))
            }
        }
        return out.sorted { $0.fireDate < $1.fireDate }
    }
}
