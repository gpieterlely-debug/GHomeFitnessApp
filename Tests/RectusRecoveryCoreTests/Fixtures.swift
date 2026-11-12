import Foundation
@testable import RectusRecoveryCore

enum Fx {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    static var injury: Date { ClinicalConfiguration.injuryDate(calendar: calendar) }

    /// Day N after injury at 09:00 (day 0 = injury date).
    static func day(_ n: Int, hour: Int = 9) -> Date {
        calendar.date(byAdding: .hour, value: n * 24 + hour, to: injury)!
    }

    static func seeded() -> RecoveryRecord { ClinicalConfiguration.initialRecord(calendar: calendar) }

    /// Adds a clinic letter and returns an attestation that cites it.
    static func attestation(in r: inout RecoveryRecord, on date: Date, name: String = "Dr. Ortho") -> ClinicianAttestation {
        let doc = ClinicalDocument(kind: .clinicLetter, title: "Clinic letter", documentDate: date, addedAt: date)
        r.addDocument(doc)
        return ClinicianAttestation(clinicianName: name, role: "Orthopedic surgeon", assessmentDate: date,
                                    instructions: "As written in letter", sourceDocumentID: doc.id)
    }

    static func checkIn(_ date: Date, resting: Int = 1, walking: Int = 2, limp: LimpStatus = .none,
                        swelling: SeverityLevel = .none, weakness: Bool = false,
                        nextDay: NextDayResponse = .same, redFlags: Set<RedFlag> = []) -> SymptomCheckIn {
        var d = SymptomCheckInDraft(date: date)
        d.restingPain = resting
        d.walkingPain = walking
        d.limp = limp
        d.swelling = swelling
        d.stiffness = .mild
        d.newWeakness = weakness
        d.activityDurationMinutes = 20
        d.nextDayResponse = nextDay
        d.redFlags = redFlags
        return try! d.validated()
    }

    /// Stable check-ins every day in [from, to].
    static func stableDays(_ r: inout RecoveryRecord, _ from: Int, _ to: Int) {
        for n in from...to { r.addCheckIn(checkIn(day(n))) }
    }

    static let quadSet = ApprovedExercise(name: "Quadriceps set", parameters: "5 × 10 s at 30% effort, 2×/day")
    static let gluteSqueeze = ApprovedExercise(name: "Gluteal squeeze", parameters: "5 × 10 s, 2×/day")
}
