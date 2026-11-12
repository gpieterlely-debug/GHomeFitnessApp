import Foundation

// MARK: - Patient profile

public enum Side: String, Codable, Sendable { case left, right }

public enum OrthopedicStatus: String, Codable, Sendable {
    case awaitingAssessment
    case assessed
}

public enum PhysiotherapyStatus: String, Codable, Sendable {
    case notStarted, referred, active, discharged
}

public enum TreatmentPathway: String, Codable, Sendable {
    case notYetConfirmed, conservative, surgical
}

public struct PatientProfile: Codable, Equatable, Sendable {
    public var injuryDate: Date
    public var side: Side
    public var diagnosis: String
    public var imagingSummary: String
    /// Walking pain reported at setup (0–10). Used as the symptom baseline
    /// until enough check-ins exist.
    public var baselineWalkingPain: Int
    public var baselineRestingPain: Int
    public var toleratedActivities: [String]
    public var goals: [String]
    public var availableKettlebellsKg: [Double]
    public var orthopedicStatus: OrthopedicStatus
    public var physiotherapyStatus: PhysiotherapyStatus
    public var treatmentPathway: TreatmentPathway

    public init(injuryDate: Date, side: Side, diagnosis: String, imagingSummary: String,
                baselineWalkingPain: Int, baselineRestingPain: Int,
                toleratedActivities: [String], goals: [String], availableKettlebellsKg: [Double],
                orthopedicStatus: OrthopedicStatus, physiotherapyStatus: PhysiotherapyStatus,
                treatmentPathway: TreatmentPathway) {
        self.injuryDate = injuryDate
        self.side = side
        self.diagnosis = diagnosis
        self.imagingSummary = imagingSummary
        self.baselineWalkingPain = baselineWalkingPain
        self.baselineRestingPain = baselineRestingPain
        self.toleratedActivities = toleratedActivities
        self.goals = goals
        self.availableKettlebellsKg = availableKettlebellsKg
        self.orthopedicStatus = orthopedicStatus
        self.physiotherapyStatus = physiotherapyStatus
        self.treatmentPathway = treatmentPathway
    }
}

// MARK: - Clinical documents (MRI reports, letters, written restrictions)

public enum DocumentKind: String, Codable, CaseIterable, Sendable {
    case mriReport, clinicLetter, writtenRestrictions, physiotherapyPlan, other
}

public struct ClinicalDocument: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var kind: DocumentKind
    public var title: String
    public var documentDate: Date
    /// File name inside the app's protected documents folder.
    public var storedFileName: String?
    public var addedAt: Date

    public init(id: UUID = UUID(), kind: DocumentKind, title: String, documentDate: Date,
                storedFileName: String? = nil, addedAt: Date) {
        self.id = id
        self.kind = kind
        self.title = title
        self.documentDate = documentDate
        self.storedFileName = storedFileName
        self.addedAt = addedAt
    }
}

// MARK: - Clinician attestation
// Every clinical decision in the app (authorization, phase change, review,
// hold release) must carry one of these. There is deliberately no other way
// to construct an authorization — HealthKit data can never produce one.

public struct ClinicianAttestation: Codable, Equatable, Sendable {
    public var clinicianName: String
    public var role: String
    public var assessmentDate: Date
    public var instructions: String
    /// Must reference a ClinicalDocument already stored in the record.
    public var sourceDocumentID: UUID

    public init(clinicianName: String, role: String, assessmentDate: Date,
                instructions: String, sourceDocumentID: UUID) {
        self.clinicianName = clinicianName
        self.role = role
        self.assessmentDate = assessmentDate
        self.instructions = instructions
        self.sourceDocumentID = sourceDocumentID
    }
}

public enum ClinicalRecordError: Error, Equatable, CustomStringConvertible {
    case missingClinicianName
    case missingSourceDocument
    case assessmentDateInFuture
    case missingFields([String])
    case valueOutOfRange(String)
    case categoryLocked(ActivityCategory, [LockReason])
    case exerciseNotApproved(String)
    case notAClinicalCategory(ActivityCategory)

    public var description: String {
        switch self {
        case .missingClinicianName: return "Clinician name is required."
        case .missingSourceDocument: return "A stored source document (letter, report, written restrictions) is required."
        case .assessmentDateInFuture: return "Assessment date cannot be in the future."
        case .missingFields(let f): return "Missing required fields: \(f.joined(separator: ", "))."
        case .valueOutOfRange(let f): return "Value out of range: \(f)."
        case .categoryLocked(let c, let r): return "\(c.displayName) is locked: \(r.map(\.description).joined(separator: "; "))."
        case .exerciseNotApproved(let e): return "\(e) is not on a current clinician approval."
        case .notAClinicalCategory(let c): return "\(c.displayName) does not need clinical authorization."
        }
    }
}
