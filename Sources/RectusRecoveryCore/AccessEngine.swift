import Foundation

// MARK: - Access engine
// Decides what the patient may do on a given date.
// Inputs: clinician authorizations, functional assessments, documented
// prerequisite completions, symptom check-ins, and holds.
// NOT inputs: calendar week, Apple Health data, time elapsed, or missed days.

public enum LockReason: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    case noClinicalAuthorization
    case authorizationExpiredOrRevoked
    case noExercisesListedByClinician
    case missingPrerequisite(ActivityCategory)
    case missingFunctionalAssessment(FunctionalTest)
    case noRecentSymptomCheckIn
    case progressionHold
    case urgentSymptoms

    public var description: String {
        switch self {
        case .noClinicalAuthorization: return "No documented clinician authorization"
        case .authorizationExpiredOrRevoked: return "Clinician authorization expired or was revoked"
        case .noExercisesListedByClinician: return "Clinician did not list specific exercises"
        case .missingPrerequisite(let c): return "Prerequisite not documented as complete: \(c.displayName)"
        case .missingFunctionalAssessment(let t): return "Functional assessment not passed: \(t.displayName)"
        case .noRecentSymptomCheckIn: return "No symptom check-in in the last 72 hours"
        case .progressionHold: return "Progression on hold because symptoms worsened"
        case .urgentSymptoms: return "Urgent symptoms reported — stop and seek medical assessment"
        }
    }
}

public enum CategoryAccess: Equatable, Sendable {
    /// Exercises the patient may log/perform. `caution` is set when an
    /// already-started activity continues during a hold (no load increases).
    case available(exercises: [ApprovedExercise], caution: String?)
    /// May be recorded, never presented as prescribed or cleared.
    case documentOnly
    case locked([LockReason])

    public var isAvailable: Bool { if case .available = self { return true }; return false }
    public var lockReasons: [LockReason] { if case .locked(let r) = self { return r }; return [] }
}

/// Everything the engine is allowed to see. Health data is intentionally absent.
public struct ClinicalEvidence: Sendable {
    public var profile: PatientProfile
    public var authorizations: [ClinicalAuthorization]
    public var functionalAssessments: [FunctionalAssessment]
    public var completions: [PrerequisiteCompletion]
    public var checkIns: [SymptomCheckIn]
    public var holds: [ProgressionHold]
    public var activityLog: [ActivityLogEntry]
    public var rules: ProgressionRules
}

public enum AccessEngine {
    public static let holdCaution = "Symptoms worsened: continue only as your clinician directed. Do not increase load, range, duration, or speed until reviewed."

    public static func activeHold(_ e: ClinicalEvidence, at date: Date) -> ProgressionHold? {
        e.holds.filter { $0.startedAt <= date && ($0.releasedAt.map { $0 > date } ?? true) }
            .max { $0.level < $1.level }
    }

    public static func access(_ category: ActivityCategory, at date: Date, evidence e: ClinicalEvidence) -> CategoryAccess {
        let hold = activeHold(e, at: date)
        switch category.baselineAccess {
        case .documentOnly:
            return .documentOnly
        case .permittedLogging:
            let ex = ExerciseLibrary.exercises(in: category).map { ApprovedExercise(name: $0.name, parameters: "Within comfort; stop if limping or pain rises") }
            return .available(exercises: ex, caution: hold.map { _ in holdCaution })
        case .requiresClinicalAuthorization:
            break
        }

        var reasons: [LockReason] = []
        let forCategory = e.authorizations.filter { $0.category == category }
        let active = forCategory.filter { $0.isActive(on: date) }
        let exercises = Array(Set(active.flatMap(\.approvedExercises))).sorted { $0.name < $1.name }

        if active.isEmpty {
            reasons.append(forCategory.contains { $0.effectiveFrom <= date } ? .authorizationExpiredOrRevoked : .noClinicalAuthorization)
        } else if exercises.isEmpty {
            reasons.append(.noExercisesListedByClinician)
        }

        let rule = e.rules.rule(for: category)
        for p in rule.prerequisites where !e.completions.contains(where: { $0.category == p && $0.completedOn <= date }) {
            reasons.append(.missingPrerequisite(p))
        }
        for t in rule.requiredAssessments {
            let latest = e.functionalAssessments.filter { $0.test == t && $0.date <= date }.max { $0.date < $1.date }
            if latest?.passed != true { reasons.append(.missingFunctionalAssessment(t)) }
        }

        let priorCheckIns = e.checkIns.filter { $0.date <= date }
        if let latest = priorCheckIns.max(by: { $0.date < $1.date }),
           date.timeIntervalSince(latest.date) <= e.rules.symptomRecencyHours * 3600 {
            // Favorable symptom response is enforced through holds below.
        } else {
            reasons.append(.noRecentSymptomCheckIn)
        }

        var caution: String?
        if let h = hold {
            if h.level == .urgent {
                reasons.append(.urgentSymptoms)
            } else {
                let startedBeforeHold = e.activityLog.contains { $0.category == category && $0.date < h.startedAt }
                if startedBeforeHold { caution = holdCaution } else { reasons.append(.progressionHold) }
            }
        }

        return reasons.isEmpty ? .available(exercises: exercises, caution: caution) : .locked(reasons)
    }

    public static func progressionPaused(_ e: ClinicalEvidence, at date: Date) -> Bool {
        activeHold(e, at: date) != nil
    }
}
