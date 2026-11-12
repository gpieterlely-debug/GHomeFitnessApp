import XCTest
@testable import RectusRecoveryCore

final class SafetyTests: XCTestCase {

    func testSeedMatchesV21Configuration() {
        let r = Fx.seeded()
        XCTAssertEqual(r.configurationVersion, "2.1")
        XCTAssertEqual(r.profile.side, .left)
        XCTAssertEqual(r.profile.orthopedicStatus, .awaitingAssessment)
        XCTAssertEqual(r.profile.physiotherapyStatus, .notStarted)
        XCTAssertEqual(r.profile.treatmentPathway, .notYetConfirmed)
        XCTAssertEqual(r.profile.availableKettlebellsKg, [8, 12, 16, 18, 20, 24, 28])
        XCTAssertEqual(r.plan.provisionalWeeks, 16)
        XCTAssertEqual(r.plan.calendarWeek(on: ClinicalConfiguration.assessmentDate(calendar: Fx.calendar), calendar: Fx.calendar), 4)
        XCTAssertTrue(r.authorizations.isEmpty)
        XCTAssertEqual(r.appointments.first?.questions.count, Appointment.orthopedicQuestions.count)
        XCTAssertTrue(r.pendingMilestones(at: Fx.day(21)).contains { $0.hasPrefix("Orthopedic assessment — booked") })
    }

    func testNov19VisitRemindersAndFindingsPrompt() {
        let r = Fx.seeded()
        let visit = ClinicalConfiguration.orthopedicAppointment(calendar: Fx.calendar)
        XCTAssertEqual(r.appointments[0].scheduledAt, visit)
        XCTAssertEqual(r.plan.calendarWeek(on: visit, calendar: Fx.calendar), 5)   // day 28
        let reminders = ReminderPlanner.reminders(for: r.appointments, now: Fx.day(21))
        XCTAssertEqual(reminders.map(\.fireDate), [visit.addingTimeInterval(-72 * 3600), visit.addingTimeInterval(-24 * 3600),
                                                   visit.addingTimeInterval(-2 * 3600), visit.addingTimeInterval(2 * 3600)])
        // Day after the visit, until findings are entered:
        let after = Fx.day(29)
        XCTAssertTrue(r.pendingMilestones(at: after).contains("Enter specialist findings: Orthopedic assessment"))
        XCTAssertEqual(r.statusLabel(at: after), "PROTECTION — AWAITING CLINICAL ASSESSMENT")
        XCTAssertTrue(ActivityCategory.restricted.allSatisfy { !r.access($0, at: after).isAvailable })
    }

    func testSelfAssessedTestsCountUnlessClinicianRequired() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 60, 63)
        let a = Fx.attestation(in: &r, on: Fx.day(60))
        try r.addAuthorization(ClinicalAuthorization(category: .stationaryCycling,
                                                     approvedExercises: [ApprovedExercise(name: "Stationary bike", parameters: "10 min, no resistance")],
                                                     attestation: a, effectiveFrom: Fx.day(60)), now: Fx.day(60))
        try r.recordFunctionalAssessment(FunctionalAssessment(test: .walkingWithoutLimp, date: Fx.day(61), passed: true, assessedBy: "Me"))
        XCTAssertEqual(r.functionalAssessments[0].assessorRole, .patientSelfAssessed)
        let now = Fx.day(63, hour: 12)
        XCTAssertTrue(r.access(.stationaryCycling, at: now).isAvailable)
        r.rules.clinicianAssessmentRequiredFor = [.stationaryCycling]
        XCTAssertEqual(r.access(.stationaryCycling, at: now).lockReasons, [.clinicianAssessmentRequired(.walkingWithoutLimp)])
    }

    func testCheckInRequiresEveryField() {
        var d = SymptomCheckInDraft(date: Fx.day(21))
        d.restingPain = 1
        XCTAssertThrowsError(try d.validated()) { e in
            guard case ClinicalRecordError.missingFields(let f) = e else { return XCTFail() }
            XCTAssertEqual(f.count, 7)
            XCTAssertTrue(f.contains("next-day symptom response"))
        }
        d = SymptomCheckInDraft(date: Fx.day(21))
        d.restingPain = 11; d.walkingPain = 2; d.limp = LimpStatus.none; d.swelling = SeverityLevel.none; d.stiffness = SeverityLevel.none
        d.newWeakness = false; d.activityDurationMinutes = 0; d.nextDayResponse = .same
        XCTAssertThrowsError(try d.validated())
    }

    func testRedFlagIsUrgentAndBlocksEvenStartedActivity() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 25, 28)
        let a = Fx.attestation(in: &r, on: Fx.day(28))
        try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a, approvedIsometrics: [Fx.quadSet]), now: Fx.day(28))
        try r.logActivity(ActivityLogEntry(date: Fx.day(28, hour: 12), category: .gentleIsometrics, exerciseName: "Quadriceps set", durationMinutes: 5))

        let e = r.addCheckIn(Fx.checkIn(Fx.day(29), redFlags: [.newPopOrPalpableGap]))
        XCTAssertEqual(e.level, .urgent)
        XCTAssertTrue(e.message.hasPrefix("URGENT"))
        XCTAssertTrue(r.access(.gentleIsometrics, at: Fx.day(29, hour: 10)).lockReasons.contains(.urgentSymptoms))

        // Stable days do NOT release an urgent hold…
        Fx.stableDays(&r, 30, 34)
        XCTAssertTrue(AccessEngine.progressionPaused(r.evidence, at: Fx.day(34, hour: 10)))
        // …only a documented clinical review does.
        let rev = Fx.attestation(in: &r, on: Fx.day(34, hour: 11))
        try r.recordClinicalReview(ClinicalReview(attestation: rev, outcome: "Re-imaged; no new tear"), now: Fx.day(34, hour: 12))
        XCTAssertFalse(AccessEngine.progressionPaused(r.evidence, at: Fx.day(34, hour: 12)))
    }

    func testRapidRiseWithin48hIsUrgent() {
        var r = Fx.seeded()
        Fx.stableDays(&r, 20, 24)
        XCTAssertEqual(r.addCheckIn(Fx.checkIn(Fx.day(25), walking: 5)).level, .urgent)
    }

    func testStablePainIsNotHealingClaim() {
        XCTAssertTrue(SymptomTrends.caption.contains("do not show how well the tendon has healed"))
        XCTAssertTrue(SymptomEvaluation(level: .stable, reasons: []).message.contains("does not prove"))
    }

    func testAuthorizationNeedsClinicianNameAndStoredSourceDocument() {
        var r = Fx.seeded()
        let date = Fx.day(21)
        let noDoc = ClinicianAttestation(clinicianName: "Dr. Ortho", role: "", assessmentDate: date, instructions: "", sourceDocumentID: UUID())
        XCTAssertThrowsError(try r.addAuthorization(ClinicalAuthorization(category: .stationaryCycling, approvedExercises: [],
                                                                          attestation: noDoc, effectiveFrom: date), now: date)) {
            XCTAssertEqual($0 as? ClinicalRecordError, .missingSourceDocument)
        }
        var a = Fx.attestation(in: &r, on: date)
        a.clinicianName = "  "
        XCTAssertThrowsError(try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a), now: date)) {
            XCTAssertEqual($0 as? ClinicalRecordError, .missingClinicianName)
        }
        let future = Fx.attestation(in: &r, on: Fx.day(40))
        XCTAssertThrowsError(try r.recordPhaseChange(PhaseChange(phase: .strengthening, effectiveDate: Fx.day(40), attestation: future), now: date))
    }

    func testNotAddressedFieldsUnlockNothing() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 25, 28)
        let a = Fx.attestation(in: &r, on: Fx.day(28))
        try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a), now: Fx.day(28))
        XCTAssertTrue(r.authorizations.isEmpty)
        XCTAssertTrue(ActivityCategory.restricted.allSatisfy { !r.access($0, at: Fx.day(28, hour: 12)).isAvailable })
        XCTAssertTrue(r.pendingMilestones(at: Fx.day(28, hour: 12)).contains { $0.hasPrefix("Review written restrictions") })
    }

    func testPrerequisitesAndAssessmentsGateProgression() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 50, 56)
        let a = Fx.attestation(in: &r, on: Fx.day(50))
        try r.addAuthorization(ClinicalAuthorization(category: .controlledHipKneeStrengthening,
                                                     approvedExercises: [ApprovedExercise(name: "Bridge", parameters: "3×10")],
                                                     attestation: a, effectiveFrom: Fx.day(50)), now: Fx.day(50))
        let now = Fx.day(56, hour: 12)
        XCTAssertEqual(Set(r.access(.controlledHipKneeStrengthening, at: now).lockReasons),
                       [.missingPrerequisite(.gentleIsometrics), .missingFunctionalAssessment(.walkingWithoutLimp),
                        .missingFunctionalAssessment(.painFreeStraightLegRaise)])
        try r.recordCompletion(PrerequisiteCompletion(category: .gentleIsometrics, completedOn: Fx.day(52), documentedBy: "Physio"))
        try r.recordFunctionalAssessment(FunctionalAssessment(test: .walkingWithoutLimp, date: Fx.day(52), passed: true, assessedBy: "Physio"))
        try r.recordFunctionalAssessment(FunctionalAssessment(test: .painFreeStraightLegRaise, date: Fx.day(52), passed: true, assessedBy: "Physio"))
        XCTAssertTrue(r.access(.controlledHipKneeStrengthening, at: now).isAvailable)
        // A later failed retest re-locks.
        try r.recordFunctionalAssessment(FunctionalAssessment(test: .painFreeStraightLegRaise, date: Fx.day(55), passed: false, assessedBy: "Physio"))
        XCTAssertFalse(r.access(.controlledHipKneeStrengthening, at: now).isAvailable)
    }

    func testRevokedAuthorizationRelocks() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 25, 30)
        let a = Fx.attestation(in: &r, on: Fx.day(25))
        try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a, approvedIsometrics: [Fx.quadSet]), now: Fx.day(25))
        r.revokeAuthorization(id: r.authorizations[0].id, on: Fx.day(29), reason: "Surgery scheduled")
        XCTAssertEqual(r.access(.gentleIsometrics, at: Fx.day(30, hour: 12)).lockReasons, [.authorizationExpiredOrRevoked])
        XCTAssertEqual(r.authorizations.count, 1) // history kept
    }

    func testCannotAuthorizeBaselineOrUpperBodyAsClinicalCategory() {
        var r = Fx.seeded()
        let a = Fx.attestation(in: &r, on: Fx.day(21))
        XCTAssertThrowsError(try r.addAuthorization(ClinicalAuthorization(category: .supportedUpperBody, approvedExercises: [],
                                                                          attestation: a, effectiveFrom: Fx.day(21)), now: Fx.day(21)))
    }

    func testUpperBodyIsDocumentedNotPrescribed() throws {
        var r = Fx.seeded()
        let e = ActivityLogEntry(date: Fx.day(21), category: .supportedUpperBody, exerciseName: "Seated DB press", durationMinutes: 20)
        try r.logActivity(e)
        XCTAssertTrue(r.activityLog[0].isDocumentationOnly)
        XCTAssertNil(r.dashboard(at: Fx.day(21), calendar: Fx.calendar).available[.supportedUpperBody])
    }
}

final class HealthAndPersistenceTests: XCTestCase {

    func sample(_ id: UUID = UUID(), start: Date, minutes: Double, metres: Double, source: String) -> HealthSample {
        HealthSample(id: id, metric: .workout, start: start, end: start.addingTimeInterval(minutes * 60), value: metres,
                     unit: "m", workoutActivity: "cycling", durationSeconds: minutes * 60, sourceBundleID: source, sourceName: source)
    }

    func testDuplicateAndOverlappingWorkoutsAreSkipped() {
        var h = HealthDataStore()
        let id = UUID()
        let a = sample(id, start: Fx.day(21, hour: 7), minutes: 60, metres: 30_000, source: "watch")
        XCTAssertEqual(h.ingest(metric: .workout, added: [a], deletedIDs: [], newAnchor: nil, at: Fx.day(21)).added, 1)
        // Same UUID re-delivered (anchored query after offline period).
        XCTAssertEqual(h.ingest(metric: .workout, added: [a], deletedIDs: [], newAnchor: nil, at: Fx.day(21)).duplicatesSkipped, 1)
        // Same ride from a second app, offset by 2 minutes.
        let b = sample(start: Fx.day(21, hour: 7).addingTimeInterval(120), minutes: 60, metres: 29_800, source: "strava")
        XCTAssertEqual(h.ingest(metric: .workout, added: [b], deletedIDs: [], newAnchor: nil, at: Fx.day(21)).duplicatesSkipped, 1)
        // Deleted in Health → removed here.
        XCTAssertEqual(h.ingest(metric: .workout, added: [], deletedIDs: [id], newAnchor: Data([1]), at: Fx.day(21)).deleted, 1)
        XCTAssertTrue(h.samples.isEmpty)
        XCTAssertEqual(h.anchors[.workout], Data([1]))
    }

    func testMissingDataIsNilNotZero() {
        let h = HealthDataStore()
        XCTAssertNil(h.dailyTotal(.steps, day: Fx.day(21), calendar: Fx.calendar))
        XCTAssertEqual(Set(h.staleMetrics(now: Fx.day(21))), Set(HealthMetric.allCases))
    }

    func testRecordRoundTripsOffline() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 18, 21)
        let a = Fx.attestation(in: &r, on: Fx.day(21))
        try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a, approvedIsometrics: [Fx.quadSet],
                                                              followUpDate: Fx.day(42)), now: Fx.day(21, hour: 12))
        r.importHealth(metric: .steps, added: [HealthSample(id: UUID(), metric: .steps, start: Fx.day(21), end: Fx.day(21, hour: 10),
                                                            value: 4200, unit: "count", sourceBundleID: "x", sourceName: "x")],
                       newAnchor: Data([9]), at: Fx.day(21))
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = RecordStore(url: dir.appendingPathComponent("record.json"))
        try store.save(r)
        let loaded = try XCTUnwrap(store.load())
        XCTAssertEqual(loaded, r)
        XCTAssertEqual(try store.loadOrSeed(calendar: Fx.calendar), r) // never re-seeds over data
    }

    func testAppointmentRemindersAndFindingsPrompt() {
        var r = Fx.seeded()
        var appt = r.appointments[0]
        appt.scheduledAt = Fx.day(26, hour: 14)
        r.updateAppointment(appt)
        let reminders = ReminderPlanner.reminders(for: r.appointments, now: Fx.day(21))
        XCTAssertEqual(reminders.count, 4) // 72h, 24h, 2h before + findings prompt after
        XCTAssertEqual(reminders.last?.title, "Record specialist findings")
        XCTAssertTrue(r.dashboard(at: Fx.day(27), calendar: Fx.calendar).appointmentsNeedingFindings.contains { $0.id == appt.id })
    }
}
