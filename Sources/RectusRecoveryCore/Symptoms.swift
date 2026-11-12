import Foundation

// MARK: - Daily symptom check-in

public enum LimpStatus: Int, Codable, CaseIterable, Comparable, Sendable {
    case none = 0, mild, marked, unableToBearWeight
    public static func < (l: Self, r: Self) -> Bool { l.rawValue < r.rawValue }
}

public enum SeverityLevel: Int, Codable, CaseIterable, Comparable, Sendable {
    case none = 0, mild, moderate, severe
    public static func < (l: Self, r: Self) -> Bool { l.rawValue < r.rawValue }
}

/// How the leg felt the day after the previous day's activity.
public enum NextDayResponse: String, Codable, CaseIterable, Sendable {
    case better, same, worse, noActivityYesterday
}

public enum RedFlag: String, Codable, CaseIterable, Sendable {
    case newPopOrPalpableGap
    case unableToBearWeight
    case rapidlyIncreasingSwellingOrBruising
    case numbnessTinglingOrColdLeg
    case calfPainSwellingOrWarmth
    case feverOrSpreadingRedness
    case chestPainOrShortnessOfBreath

    public var displayName: String {
        switch self {
        case .newPopOrPalpableGap: return "New pop, sudden give-way, or a gap you can feel"
        case .unableToBearWeight: return "Cannot put weight on the leg"
        case .rapidlyIncreasingSwellingOrBruising: return "Rapidly increasing swelling or bruising"
        case .numbnessTinglingOrColdLeg: return "Numbness, tingling, or a cold/pale leg"
        case .calfPainSwellingOrWarmth: return "Calf pain, swelling, or warmth"
        case .feverOrSpreadingRedness: return "Fever or spreading redness"
        case .chestPainOrShortnessOfBreath: return "Chest pain or shortness of breath"
        }
    }
}

public struct SymptomCheckIn: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var date: Date
    public var restingPain: Int
    public var walkingPain: Int
    public var limp: LimpStatus
    public var swelling: SeverityLevel
    public var stiffness: SeverityLevel
    public var newWeakness: Bool
    public var activityDurationMinutes: Int
    public var nextDayResponse: NextDayResponse
    public var redFlags: Set<RedFlag>
    public var notes: String
}

/// Form state. Every required field starts empty so nothing is defaulted
/// silently; `validated()` refuses to produce a check-in with gaps.
public struct SymptomCheckInDraft: Equatable, Sendable {
    public var date: Date
    public var restingPain: Int?
    public var walkingPain: Int?
    public var limp: LimpStatus?
    public var swelling: SeverityLevel?
    public var stiffness: SeverityLevel?
    public var newWeakness: Bool?
    public var activityDurationMinutes: Int?
    public var nextDayResponse: NextDayResponse?
    public var redFlags: Set<RedFlag> = []
    public var notes: String = ""

    public init(date: Date) { self.date = date }

    public func validated() throws -> SymptomCheckIn {
        var missing: [String] = []
        if restingPain == nil { missing.append("resting pain") }
        if walkingPain == nil { missing.append("walking pain") }
        if limp == nil { missing.append("limp status") }
        if swelling == nil { missing.append("swelling") }
        if stiffness == nil { missing.append("stiffness") }
        if newWeakness == nil { missing.append("new weakness") }
        if activityDurationMinutes == nil { missing.append("activity duration") }
        if nextDayResponse == nil { missing.append("next-day symptom response") }
        guard missing.isEmpty else { throw ClinicalRecordError.missingFields(missing) }
        guard (0...10).contains(restingPain!) else { throw ClinicalRecordError.valueOutOfRange("resting pain must be 0–10") }
        guard (0...10).contains(walkingPain!) else { throw ClinicalRecordError.valueOutOfRange("walking pain must be 0–10") }
        guard activityDurationMinutes! >= 0 else { throw ClinicalRecordError.valueOutOfRange("activity duration") }
        return SymptomCheckIn(id: UUID(), date: date, restingPain: restingPain!, walkingPain: walkingPain!,
                              limp: limp!, swelling: swelling!, stiffness: stiffness!, newWeakness: newWeakness!,
                              activityDurationMinutes: activityDurationMinutes!, nextDayResponse: nextDayResponse!,
                              redFlags: redFlags, notes: notes)
    }
}

// MARK: - Evaluation
// ASSUMPTION: thresholds below are conservative app defaults, not validated
// clinical cut-offs. The app's job is to say "hold and ask", never "go".

public enum SymptomLevel: Int, Codable, Comparable, Sendable {
    case stable = 0, worsening, urgent
    public static func < (l: Self, r: Self) -> Bool { l.rawValue < r.rawValue }
}

public struct SymptomEvaluation: Equatable, Sendable {
    public var level: SymptomLevel
    public var reasons: [String]

    public var message: String {
        switch level {
        case .stable:
            return "Symptoms stable compared with your recent baseline. Stable pain does not prove the tendon has healed."
        case .worsening:
            return "Symptoms are worse. Hold progression: do not add load, distance, or new activities. Contact your orthopedic specialist or physiotherapist for review."
        case .urgent:
            return SymptomEvaluator.urgentMessage
        }
    }
}

public enum SymptomEvaluator {
    public static let urgentMessage = """
    URGENT: Stop activity. Seek same-day medical assessment (urgent care or emergency department). \
    Call your local emergency number for chest pain, shortness of breath, a cold or numb leg, or if you cannot bear weight.
    """

    struct Baseline { var walking: Int; var resting: Int; var limp: LimpStatus; var swelling: SeverityLevel }

    /// Baseline = median of up to 7 check-ins before `latest`; falls back to the profile values.
    static func baseline(before latest: SymptomCheckIn, history: [SymptomCheckIn], profile: PatientProfile) -> Baseline {
        let prior = history.filter { $0.date < latest.date }.sorted { $0.date < $1.date }.suffix(7)
        guard !prior.isEmpty else {
            return Baseline(walking: profile.baselineWalkingPain, resting: profile.baselineRestingPain, limp: .none, swelling: .none)
        }
        func median(_ xs: [Int]) -> Int { let s = xs.sorted(); return s[s.count / 2] }
        return Baseline(walking: median(prior.map(\.walkingPain)),
                        resting: median(prior.map(\.restingPain)),
                        limp: LimpStatus(rawValue: median(prior.map(\.limp.rawValue)))!,
                        swelling: SeverityLevel(rawValue: median(prior.map(\.swelling.rawValue)))!)
    }

    public static func evaluate(_ latest: SymptomCheckIn, history: [SymptomCheckIn], profile: PatientProfile) -> SymptomEvaluation {
        let b = baseline(before: latest, history: history, profile: profile)
        let previous = history.filter { $0.date < latest.date }.max { $0.date < $1.date }

        var urgent: [String] = latest.redFlags.sorted { $0.rawValue < $1.rawValue }.map { "Red flag: \($0.displayName)" }
        if latest.restingPain >= 7 { urgent.append("Resting pain \(latest.restingPain)/10") }
        if latest.walkingPain >= 8 { urgent.append("Walking pain \(latest.walkingPain)/10") }
        if latest.limp == .unableToBearWeight { urgent.append("Unable to bear weight") }
        if latest.walkingPain - b.walking >= 4 { urgent.append("Walking pain up \(latest.walkingPain - b.walking) points from baseline") }
        if let p = previous, latest.date.timeIntervalSince(p.date) <= 48 * 3600,
           latest.walkingPain - p.walkingPain >= 3 || latest.restingPain - p.restingPain >= 3 {
            urgent.append("Pain rose 3+ points within 48 hours")
        }
        if latest.swelling == .severe { urgent.append("Severe swelling") }
        if !urgent.isEmpty { return SymptomEvaluation(level: .urgent, reasons: urgent) }

        var worse: [String] = []
        if latest.walkingPain - b.walking >= 2 { worse.append("Walking pain up \(latest.walkingPain - b.walking) points from baseline") }
        if latest.restingPain - b.resting >= 2 { worse.append("Resting pain up \(latest.restingPain - b.resting) points from baseline") }
        if latest.limp > b.limp { worse.append("New or worse limp") }
        if latest.newWeakness { worse.append("New weakness") }
        if latest.swelling > b.swelling { worse.append("More swelling than baseline") }
        if latest.nextDayResponse == .worse { worse.append("Worse the day after activity") }
        if !worse.isEmpty { return SymptomEvaluation(level: .worsening, reasons: worse) }

        return SymptomEvaluation(level: .stable, reasons: [])
    }
}

// MARK: - Trends (display only)

public struct TrendPoint: Equatable, Sendable {
    public var date: Date
    public var walkingPain: Int
    public var restingPain: Int
    public var walkingPain7DayAverage: Double
}

public enum SymptomTrends {
    public static let caption = "Pain scores show how symptoms change. They do not show how well the tendon has healed."

    public static func series(_ checkIns: [SymptomCheckIn]) -> [TrendPoint] {
        let sorted = checkIns.sorted { $0.date < $1.date }
        return sorted.map { c in
            let window = sorted.filter { $0.date <= c.date && c.date.timeIntervalSince($0.date) < 7 * 86_400 }
            let avg = Double(window.map(\.walkingPain).reduce(0, +)) / Double(window.count)
            return TrendPoint(date: c.date, walkingPain: c.walkingPain, restingPain: c.restingPain, walkingPain7DayAverage: avg)
        }
    }
}

// MARK: - Progression holds

public struct ProgressionHold: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var startedAt: Date
    public var level: SymptomLevel
    public var reasons: [String]
    public var triggeringCheckInID: UUID
    public var releasedAt: Date?
    public var releaseReason: String?
}

/// Documented review by a clinician (in person, phone, or letter).
public struct ClinicalReview: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var attestation: ClinicianAttestation
    public var outcome: String

    public init(id: UUID = UUID(), attestation: ClinicianAttestation, outcome: String) {
        self.id = id
        self.attestation = attestation
        self.outcome = outcome
    }
}
