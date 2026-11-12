import Foundation

/// Clinical Configuration Update v2.1 — verified patient inputs as of
/// 12 Nov 2026. Seeds a new record; never overwrites an existing one.
public enum ClinicalConfiguration {
    public static let version = "2.1"

    public static func injuryDate(calendar: Calendar) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: 22))!
    }

    public static func assessmentDate(calendar: Calendar) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 11, day: 12))!
    }

    public static func initialRecord(calendar: Calendar) -> RecoveryRecord {
        let injury = injuryDate(calendar: calendar)
        let profile = PatientProfile(
            injuryDate: injury,
            side: .left,
            diagnosis: "High-grade partial left rectus femoris tendon tear with associated rectus femoris and iliopsoas muscle injury",
            imagingSummary: "MRI: mild tendon laxity without complete retraction",
            baselineWalkingPain: 3,   // reported 2–3/10; upper value used (conservative)
            baselineRestingPain: 0,   // ASSUMPTION: not reported; confirm at first check-in
            toleratedActivities: ["Walking"],
            goals: ["Return to cycling", "Return to running", "Return to kettlebell workouts", "Kick a soccer ball"],
            availableKettlebellsKg: [8, 12, 16, 18, 20, 24, 28],
            orthopedicStatus: .awaitingAssessment,
            physiotherapyStatus: .notStarted,
            treatmentPathway: .notYetConfirmed)

        var record = RecoveryRecord(configurationVersion: version, profile: profile,
                                    plan: RecoveryPlan(startDate: injury, provisionalWeeks: 16))
        record.addAppointment(Appointment(
            kind: .orthopedic,
            title: "Orthopedic assessment",
            scheduledAt: nil, // patient enters date once booked
            questions: Appointment.orthopedicQuestions.map { ChecklistItem(question: $0) }))
        return record
    }
}
