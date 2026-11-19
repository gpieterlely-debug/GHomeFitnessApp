import Foundation

/// The single source of truth. Append-only for clinical history: entries are
/// added, revoked, or released — never deleted — so extending the plan or
/// changing phases never loses past data.
public struct RecoveryRecord: Codable, Equatable, Sendable {
    public static let currentSchemaVersion = 1

    public var schemaVersion = RecoveryRecord.currentSchemaVersion
    public var configurationVersion: String
    public var profile: PatientProfile
    public var plan: RecoveryPlan
    public var documents: [ClinicalDocument] = []
    public var checkIns: [SymptomCheckIn] = []
    public var holds: [ProgressionHold] = []
    public var reviews: [ClinicalReview] = []
    public var orthopedicAssessments: [OrthopedicAssessment] = []
    public var restrictionsReviewed: [UUID: Date] = [:]
    public var authorizations: [ClinicalAuthorization] = []
    public var functionalAssessments: [FunctionalAssessment] = []
    public var completions: [PrerequisiteCompletion] = []
    public var phaseChanges: [PhaseChange] = []
    public var appointments: [Appointment] = []
    public var activityLog: [ActivityLogEntry] = []
    public var rules: ProgressionRules = .defaults
    public var health = HealthDataStore()

    public init(configurationVersion: String, profile: PatientProfile, plan: RecoveryPlan) {
        self.configurationVersion = configurationVersion
        self.profile = profile
        self.plan = plan
    }

    // MARK: Derived

    public var evidence: ClinicalEvidence {
        ClinicalEvidence(profile: profile, authorizations: authorizations, functionalAssessments: functionalAssessments,
                         completions: completions, checkIns: checkIns, holds: holds, activityLog: activityLog, rules: rules)
    }

    public func access(_ c: ActivityCategory, at date: Date) -> CategoryAccess {
        AccessEngine.access(c, at: date, evidence: evidence)
    }

    /// Phase changes only through documented clinician decisions; default is protection.
    public func phase(at date: Date) -> ClinicalPhase {
        phaseChanges.filter { $0.effectiveDate <= date }.latest(by: \.effectiveDate)?.phase ?? .protection
    }

    public func latestEvaluation(at date: Date) -> SymptomEvaluation? {
        guard let latest = checkIns.filter({ $0.date <= date }).latest(by: \.date) else { return nil }
        return SymptomEvaluator.evaluate(latest, history: checkIns, profile: profile)
    }

    // MARK: Validation

    func validate(_ a: ClinicianAttestation, now: Date) throws {
        if a.clinicianName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { throw ClinicalRecordError.missingClinicianName }
        if !documents.contains(where: { $0.id == a.sourceDocumentID }) { throw ClinicalRecordError.missingSourceDocument }
        if a.assessmentDate > now { throw ClinicalRecordError.assessmentDateInFuture }
    }

    // MARK: Documents & appointments

    public mutating func addDocument(_ d: ClinicalDocument) { documents.append(d) }

    public mutating func addAppointment(_ a: Appointment) { appointments.append(a) }

    public mutating func updateAppointment(_ a: Appointment) {
        if let i = appointments.firstIndex(where: { $0.id == a.id }) { appointments[i] = a }
    }

    // MARK: Symptom check-ins

    /// Stores the check-in, evaluates it, and opens/escalates/releases holds.
    @discardableResult
    public mutating func addCheckIn(_ c: SymptomCheckIn) -> SymptomEvaluation {
        checkIns.append(c)
        let eval = SymptomEvaluator.evaluate(c, history: checkIns, profile: profile)
        let openIdx = holds.indices.filter { holds[$0].releasedAt == nil && holds[$0].startedAt <= c.date }

        if eval.level >= .worsening {
            if let i = openIdx.last {
                if eval.level > holds[i].level { holds[i].level = eval.level }
                holds[i].reasons.append(contentsOf: eval.reasons.filter { !holds[i].reasons.contains($0) })
            } else {
                holds.append(ProgressionHold(id: UUID(), startedAt: c.date, level: eval.level, reasons: eval.reasons,
                                             triggeringCheckInID: c.id, releasedAt: nil, releaseReason: nil))
            }
        } else {
            // Non-urgent holds release after N consecutive stable check-ins.
            // Urgent holds release only through a documented clinical review.
            let n = rules.stableCheckInsToReleaseHold
            for i in openIdx where holds[i].level == .worsening {
                let since = checkIns.filter { $0.date > holds[i].startedAt && $0.date <= c.date }.sorted { $0.date < $1.date }
                let tail = since.suffix(n)
                if tail.count == n && tail.allSatisfy({ SymptomEvaluator.evaluate($0, history: checkIns, profile: profile).level == .stable }) {
                    holds[i].releasedAt = c.date
                    holds[i].releaseReason = "\(n) consecutive stable check-ins"
                }
            }
        }
        return eval
    }

    // MARK: Clinical decisions (all require attestation + stored source document)

    public mutating func recordOrthopedicAssessment(_ a: OrthopedicAssessment, now: Date) throws {
        try validate(a.attestation, now: now)
        orthopedicAssessments.append(a)
        authorizations.append(contentsOf: a.derivedAuthorizations())
        profile.orthopedicStatus = .assessed
        if a.physiotherapyReferral == true && profile.physiotherapyStatus == .notStarted { profile.physiotherapyStatus = .referred }
        if let p = a.treatmentPathway { profile.treatmentPathway = p }
        for i in appointments.indices where appointments[i].kind == .orthopedic && appointments[i].findingsRecordedAt == nil {
            if let s = appointments[i].scheduledAt, s <= now { appointments[i].findingsRecordedAt = now }
        }
        if let f = a.followUpDate {
            appointments.append(Appointment(kind: .orthopedic, title: "Orthopedic follow-up", scheduledAt: f,
                                            clinicianName: a.attestation.clinicianName,
                                            questions: Appointment.orthopedicQuestions.map { ChecklistItem(question: $0) }))
        }
    }

    public mutating func markRestrictionsReviewed(assessmentID: UUID, at date: Date) {
        restrictionsReviewed[assessmentID] = date
    }

    public mutating func addAuthorization(_ a: ClinicalAuthorization, now: Date) throws {
        guard a.category.baselineAccess == .requiresClinicalAuthorization else { throw ClinicalRecordError.notAClinicalCategory(a.category) }
        try validate(a.attestation, now: now)
        authorizations.append(a)
    }

    public mutating func revokeAuthorization(id: UUID, on date: Date, reason: String) {
        if let i = authorizations.firstIndex(where: { $0.id == id }) {
            authorizations[i].revokedOn = date
            authorizations[i].revocationReason = reason
        }
    }

    public mutating func recordPhaseChange(_ p: PhaseChange, now: Date) throws {
        try validate(p.attestation, now: now)
        phaseChanges.append(p)
    }

    /// A documented review releases every hold that started before it.
    public mutating func recordClinicalReview(_ r: ClinicalReview, now: Date) throws {
        try validate(r.attestation, now: now)
        reviews.append(r)
        for i in holds.indices where holds[i].releasedAt == nil && holds[i].startedAt <= r.attestation.assessmentDate {
            holds[i].releasedAt = r.attestation.assessmentDate
            holds[i].releaseReason = "Clinical review by \(r.attestation.clinicianName)"
        }
    }

    public mutating func recordFunctionalAssessment(_ f: FunctionalAssessment) throws {
        if f.assessedBy.trimmingCharacters(in: .whitespaces).isEmpty { throw ClinicalRecordError.missingFields(["assessed by"]) }
        functionalAssessments.append(f)
    }

    public mutating func recordCompletion(_ c: PrerequisiteCompletion) throws {
        if c.documentedBy.trimmingCharacters(in: .whitespaces).isEmpty { throw ClinicalRecordError.missingFields(["documented by"]) }
        completions.append(c)
    }

    // MARK: Activity log

    public mutating func logActivity(_ entry: ActivityLogEntry) throws {
        switch access(entry.category, at: entry.date) {
        case .documentOnly:
            break
        case .available(let exercises, _):
            if entry.category.baselineAccess == .requiresClinicalAuthorization,
               !exercises.contains(where: { $0.name == entry.exerciseName }) {
                throw ClinicalRecordError.exerciseNotApproved(entry.exerciseName)
            }
        case .locked(let reasons):
            throw ClinicalRecordError.categoryLocked(entry.category, reasons)
        }
        activityLog.append(entry)
    }

    // MARK: Apple Health (performance data only — no clinical side effects)

    @discardableResult
    public mutating func importHealth(metric: HealthMetric, added: [HealthSample], deletedIDs: [UUID] = [],
                                      newAnchor: Data? = nil, at now: Date) -> HealthImportReport {
        health.ingest(metric: metric, added: added, deletedIDs: deletedIDs, newAnchor: newAnchor, at: now)
    }
}
