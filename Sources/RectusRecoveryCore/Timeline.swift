import Foundation

// MARK: - Plan and calendar weeks
// Calendar week is a label for time since injury. It never controls access.

public struct PlanExtension: Codable, Equatable, Sendable {
    public var addedWeeks: Int
    public var reason: String
    public var date: Date
}

public struct RecoveryPlan: Codable, Equatable, Sendable {
    public var startDate: Date
    public var provisionalWeeks: Int
    public var extensions: [PlanExtension] = []

    public init(startDate: Date, provisionalWeeks: Int = 16) {
        self.startDate = startDate
        self.provisionalWeeks = provisionalWeeks
    }

    public var plannedWeeks: Int { provisionalWeeks + extensions.map(\.addedWeeks).reduce(0, +) }

    public mutating func extend(by weeks: Int, reason: String, on date: Date) {
        extensions.append(PlanExtension(addedWeeks: weeks, reason: reason, date: date))
    }

    /// 1-based. Day 0–6 = week 1. Never capped at the planned length.
    public func calendarWeek(on date: Date, calendar: Calendar) -> Int {
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: startDate),
                                           to: calendar.startOfDay(for: date)).day ?? 0
        return max(1, days / 7 + 1)
    }

    /// Plan grows automatically if recovery runs past the provisional length.
    public func displayedWeeks(asOf date: Date, calendar: Calendar) -> Int {
        max(plannedWeeks, calendarWeek(on: date, calendar: calendar))
    }

    public func weekRange(_ week: Int, calendar: Calendar) -> Range<Date> {
        let s = calendar.date(byAdding: .day, value: (week - 1) * 7, to: calendar.startOfDay(for: startDate))!
        return s..<calendar.date(byAdding: .day, value: 7, to: s)!
    }
}

public enum WeekStatus: String, Sendable { case past, current, future }

/// One row in the plan screen. The six columns the spec requires are kept separate.
public struct WeeklySummary: Equatable, Sendable {
    public var calendarWeek: Int
    public var dates: Range<Date>
    public var status: WeekStatus
    public var isProvisional: Bool            // beyond-today weeks are provisional
    public var isExtension: Bool              // beyond the provisional 16 weeks
    public var clinicalPhases: [ClinicalPhase]
    public var approvedExercises: [String]    // "Category: exercise — dose"
    public var completedActivities: [ActivityLogEntry]
    public var restrictedActivities: [ActivityCategory]
    public var pendingMilestones: [String]
    public var clinicalEvents: [String]
}

public struct DashboardState: Equatable, Sendable {
    public var statusLabel: String
    public var calendarWeek: Int
    public var daysSinceInjury: Int
    public var phase: ClinicalPhase
    public var symptomEvaluation: SymptomEvaluation?
    public var checkInDueToday: Bool
    public var progressionPaused: Bool
    public var permittedLogging: [ActivityCategory]
    public var documentOnly: [ActivityCategory]
    public var available: [ActivityCategory: [ApprovedExercise]]
    public var restricted: [ActivityCategory: [LockReason]]
    public var pendingMilestones: [String]
    public var appointmentsNeedingFindings: [Appointment]
}

public extension RecoveryRecord {

    func statusLabel(at date: Date) -> String {
        let p = phase(at: date).displayName.uppercased()
        return profile.orthopedicStatus == .awaitingAssessment
            ? "\(p) — AWAITING CLINICAL ASSESSMENT"
            : "\(p) — CLINICIAN-DIRECTED"
    }

    func pendingMilestones(at date: Date) -> [String] {
        var m: [String] = []
        if profile.orthopedicStatus == .awaitingAssessment {
            let booked = appointments.filter { $0.kind == .orthopedic && ($0.scheduledAt.map { $0 > date } ?? false) }
                .compactMap(\.scheduledAt).min()
            m.append(booked.map { "Orthopedic assessment — booked \($0.formatted(date: .abbreviated, time: .shortened))" }
                     ?? "Orthopedic assessment — not yet booked")
        }
        for a in appointments where a.needsFindings(now: date) { m.append("Enter specialist findings: \(a.title)") }
        for a in orthopedicAssessments where restrictionsReviewed[a.id] == nil {
            m.append("Review written restrictions from \(a.attestation.clinicianName)")
        }
        if profile.physiotherapyStatus == .referred { m.append("Start physiotherapy") }
        if profile.treatmentPathway == .notYetConfirmed { m.append("Treatment pathway confirmed by specialist") }
        if let h = AccessEngine.activeHold(evidence, at: date) {
            m.append(h.level == .urgent ? "Urgent medical assessment of symptoms" : "Clinical review of worsening symptoms")
        }
        for a in appointments {
            guard let s = a.scheduledAt, s > date else { continue }
            if a.kind == .orthopedic && profile.orthopedicStatus == .awaitingAssessment { continue } // listed above
            m.append("\(a.title) — \(s.formatted(date: .abbreviated, time: .omitted))")
        }
        return m
    }

    func dashboard(at date: Date, calendar: Calendar) -> DashboardState {
        var available: [ActivityCategory: [ApprovedExercise]] = [:]
        var restricted: [ActivityCategory: [LockReason]] = [:]
        for c in ActivityCategory.restricted {
            switch access(c, at: date) {
            case .available(let ex, _): available[c] = ex
            case .locked(let r): restricted[c] = r
            case .documentOnly: break
            }
        }
        let today = calendar.startOfDay(for: date)
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: profile.injuryDate), to: today).day ?? 0
        return DashboardState(
            statusLabel: statusLabel(at: date),
            calendarWeek: plan.calendarWeek(on: date, calendar: calendar),
            daysSinceInjury: days,
            phase: phase(at: date),
            symptomEvaluation: latestEvaluation(at: date),
            checkInDueToday: !checkIns.contains { calendar.isDate($0.date, inSameDayAs: date) },
            progressionPaused: AccessEngine.progressionPaused(evidence, at: date),
            permittedLogging: ActivityCategory.allCases.filter { $0.baselineAccess == .permittedLogging },
            documentOnly: ActivityCategory.allCases.filter { $0.baselineAccess == .documentOnly },
            available: available,
            restricted: restricted,
            pendingMilestones: pendingMilestones(at: date),
            appointmentsNeedingFindings: appointments.filter { $0.needsFindings(now: date) }
        )
    }

    func weeklySummaries(asOf now: Date, calendar: Calendar) -> [WeeklySummary] {
        let current = plan.calendarWeek(on: now, calendar: calendar)
        return (1...plan.displayedWeeks(asOf: now, calendar: calendar)).map { w in
            let range = plan.weekRange(w, calendar: calendar)
            let status: WeekStatus = w < current ? .past : (w == current ? .current : .future)
            // Past weeks: state at end of week. Current/future: state now (future is never predicted).
            let asOf = status == .past ? range.upperBound.addingTimeInterval(-1) : now

            var phases: [ClinicalPhase] = status == .future ? [] : [phase(at: range.lowerBound)]
            for p in phaseChanges.sorted(by: { $0.effectiveDate < $1.effectiveDate }) where range.contains(p.effectiveDate) && status != .future {
                if phases.last != p.phase { phases.append(p.phase) }
            }

            let approved = authorizations.filter { $0.isActive(on: asOf) }.flatMap { a in
                a.approvedExercises.map { "\(a.category.displayName): \($0.name) — \($0.parameters)" }
            }
            let restrictedNow = ActivityCategory.restricted.filter { !access($0, at: asOf).isAvailable }

            var events: [String] = []
            for a in orthopedicAssessments where range.contains(a.attestation.assessmentDate) {
                events.append("Orthopedic assessment — \(a.attestation.clinicianName)")
            }
            for p in phaseChanges where range.contains(p.effectiveDate) {
                events.append("Phase set to \(p.phase.displayName) by \(p.attestation.clinicianName)")
            }
            for h in holds where range.contains(h.startedAt) { events.append("Progression hold started") }
            for h in holds { if let r = h.releasedAt, range.contains(r) { events.append("Hold released: \(h.releaseReason ?? "")") } }
            for a in appointments { if let s = a.scheduledAt, range.contains(s) { events.append(a.title) } }

            return WeeklySummary(
                calendarWeek: w, dates: range, status: status,
                isProvisional: status == .future, isExtension: w > plan.provisionalWeeks,
                clinicalPhases: phases,
                approvedExercises: status == .future ? [] : approved,
                completedActivities: activityLog.filter { range.contains($0.date) }.sorted { $0.date < $1.date },
                restrictedActivities: status == .future ? ActivityCategory.restricted : restrictedNow,
                pendingMilestones: status == .current ? pendingMilestones(at: now) : [],
                clinicalEvents: events)
        }
    }
}
