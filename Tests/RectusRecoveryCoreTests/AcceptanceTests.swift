import XCTest
@testable import RectusRecoveryCore

/// Section 9 of the v2.1 specification — one test per scenario.
final class AcceptanceTests: XCTestCase {

    // 1. No orthopedic clearance: cycling remains restricted.
    func test01_noOrthopedicClearance_cyclingRemainsRestricted() {
        var r = Fx.seeded()
        Fx.stableDays(&r, 18, 21) // Nov 9–12, symptoms good
        let now = Fx.day(21)      // Nov 12, 2026

        XCTAssertEqual(r.statusLabel(at: now), "PROTECTION — AWAITING CLINICAL ASSESSMENT")
        for c in [ActivityCategory.stationaryCycling, .outdoorCycling] {
            XCTAssertTrue(r.access(c, at: now).lockReasons.contains(.noClinicalAuthorization), "\(c)")
        }
        XCTAssertThrowsError(try r.logActivity(ActivityLogEntry(date: now, category: .stationaryCycling,
                                                                exerciseName: "Stationary bike", durationMinutes: 20)))
        // Baseline logging still allowed; upper body is document-only.
        XCTAssertNoThrow(try r.logActivity(ActivityLogEntry(date: now, category: .comfortableWalking,
                                                            exerciseName: "Comfortable walk", durationMinutes: 25)))
        XCTAssertEqual(r.access(.supportedUpperBody, at: now), .documentOnly)
    }

    // 2. Week 6 without clearance: restricted exercises remain locked.
    func test02_week6WithoutClearance_restrictedRemainLocked() {
        var r = Fx.seeded()
        Fx.stableDays(&r, 30, 37)
        let now = Fx.day(37)
        XCTAssertEqual(r.plan.calendarWeek(on: now, calendar: Fx.calendar), 6)
        XCTAssertEqual(r.phase(at: now), .protection)
        for c in ActivityCategory.restricted {
            XCTAssertFalse(r.access(c, at: now).isAvailable, "\(c) unlocked by time alone")
        }
    }

    // 3. Increased pain and new limping: progression is paused.
    func test03_increasedPainAndNewLimp_progressionPaused() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 20, 24)
        let a = Fx.attestation(in: &r, on: Fx.day(25))
        try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a, approvedIsometrics: [Fx.quadSet],
                                                              cyclingClearance: .stationaryOnly), now: Fx.day(25))
        r.addCheckIn(Fx.checkIn(Fx.day(25, hour: 18)))
        try r.recordFunctionalAssessment(FunctionalAssessment(test: .walkingWithoutLimp, date: Fx.day(25), passed: true, assessedBy: "Dr. Ortho"))
        try r.logActivity(ActivityLogEntry(date: Fx.day(26), category: .gentleIsometrics, exerciseName: "Quadriceps set", durationMinutes: 10))

        let eval = r.addCheckIn(Fx.checkIn(Fx.day(27), resting: 2, walking: 4, limp: .mild))
        XCTAssertEqual(eval.level, .worsening)
        XCTAssertTrue(eval.message.contains("Hold progression"))

        let now = Fx.day(27, hour: 10)
        XCTAssertTrue(r.dashboard(at: now, calendar: Fx.calendar).progressionPaused)
        // Not yet started → blocked even though authorized.
        XCTAssertTrue(r.access(.stationaryCycling, at: now).lockReasons.contains(.progressionHold))
        // Already started → continues as directed, with a no-increase caution.
        guard case .available(_, let caution) = r.access(.gentleIsometrics, at: now) else { return XCTFail() }
        XCTAssertEqual(caution, AccessEngine.holdCaution)

        // Hold persists until 3 stable check-ins or a documented review.
        r.addCheckIn(Fx.checkIn(Fx.day(28)))
        XCTAssertTrue(AccessEngine.progressionPaused(r.evidence, at: Fx.day(28, hour: 10)))
        r.addCheckIn(Fx.checkIn(Fx.day(29)))
        r.addCheckIn(Fx.checkIn(Fx.day(30)))
        XCTAssertFalse(AccessEngine.progressionPaused(r.evidence, at: Fx.day(30, hour: 10)))
    }

    // 4. Clinician approves gentle isometrics: only approved exercises become available.
    func test04_clinicianApprovesIsometrics_onlyThoseExercisesAvailable() throws {
        var r = Fx.seeded()
        let date = Fx.day(28)
        Fx.stableDays(&r, 25, 28)
        let a = Fx.attestation(in: &r, on: date)
        try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a, tearLocation: "Proximal direct head",
                                                              approvedIsometrics: [Fx.quadSet, Fx.gluteSqueeze],
                                                              cyclingClearance: .notCleared), now: date)
        let now = Fx.day(28, hour: 12)

        guard case .available(let ex, nil) = r.access(.gentleIsometrics, at: now) else { return XCTFail() }
        XCTAssertEqual(Set(ex.map(\.name)), ["Quadriceps set", "Gluteal squeeze"])
        // Library has other isometrics (incl. isometric hip flexion) — not approved, so not loggable.
        XCTAssertGreaterThan(ExerciseLibrary.exercises(in: .gentleIsometrics).count, 2)
        XCTAssertThrowsError(try r.logActivity(ActivityLogEntry(date: now, category: .gentleIsometrics,
                                                                exerciseName: "Isometric hip flexion", durationMinutes: 5)))
        XCTAssertNoThrow(try r.logActivity(ActivityLogEntry(date: now, category: .gentleIsometrics,
                                                            exerciseName: "Quadriceps set", durationMinutes: 5)))
        // Nothing else unlocked.
        for c in ActivityCategory.restricted where c != .gentleIsometrics {
            XCTAssertFalse(r.access(c, at: now).isAvailable, "\(c)")
        }
        XCTAssertEqual(r.statusLabel(at: now), "PROTECTION — CLINICIAN-DIRECTED")
    }

    // 5. Patient misses two weeks: the app does not automatically advance phases.
    func test05_missesTwoWeeks_noAutomaticPhaseAdvance() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 25, 28)
        let a = Fx.attestation(in: &r, on: Fx.day(28))
        try r.recordOrthopedicAssessment(OrthopedicAssessment(attestation: a, approvedIsometrics: [Fx.quadSet]), now: Fx.day(28))
        try r.recordPhaseChange(PhaseChange(phase: .earlyLoading, effectiveDate: Fx.day(28), attestation: a), now: Fx.day(28))

        let back = Fx.day(43) // 15 days, no check-ins, no logs
        XCTAssertEqual(r.phase(at: back), .earlyLoading)
        XCTAssertEqual(r.phaseChanges.count, 1)
        // Gap is handled safely: authorized work needs a fresh check-in first.
        XCTAssertEqual(r.access(.gentleIsometrics, at: back).lockReasons, [.noRecentSymptomCheckIn])
        XCTAssertTrue(r.dashboard(at: back, calendar: Fx.calendar).checkInDueToday)
        r.addCheckIn(Fx.checkIn(back))
        XCTAssertTrue(r.access(.gentleIsometrics, at: back.addingTimeInterval(60)).isAvailable)
        XCTAssertEqual(r.phase(at: back), .earlyLoading)
    }

    // 6. Apple Health reports a 30 km cycling workout: recorded, not clearance.
    func test06_healthKit30kmRide_recordedButNotClearance() {
        var r = Fx.seeded()
        Fx.stableDays(&r, 18, 21)
        let before = r
        let ride = HealthSample(id: UUID(), metric: .workout, start: Fx.day(21, hour: 7), end: Fx.day(21, hour: 8),
                                value: 30_000, unit: "m", workoutActivity: "cycling", durationSeconds: 3600,
                                sourceBundleID: "com.apple.health", sourceName: "Apple Watch")
        let report = r.importHealth(metric: .workout, added: [ride], at: Fx.day(21, hour: 9))
        XCTAssertEqual(report.added, 1)
        XCTAssertEqual(r.health.samples(.workout, in: Fx.day(21, hour: 0)..<Fx.day(22, hour: 0)).first?.value, 30_000)

        let now = Fx.day(21, hour: 10)
        XCTAssertTrue(r.access(.stationaryCycling, at: now).lockReasons.contains(.noClinicalAuthorization))
        XCTAssertTrue(r.access(.outdoorCycling, at: now).lockReasons.contains(.noClinicalAuthorization))
        XCTAssertEqual(r.authorizations, before.authorizations)
        XCTAssertEqual(r.completions, before.completions)
        XCTAssertEqual(r.functionalAssessments, before.functionalAssessments)
        XCTAssertEqual(r.phaseChanges, before.phaseChanges)
        XCTAssertEqual(r.activityLog, before.activityLog)
        XCTAssertEqual(r.statusLabel(at: now), "PROTECTION — AWAITING CLINICAL ASSESSMENT")
    }

    // 7. Week 16 without functional criteria: rehabilitation continues.
    func test07_week16WithoutFunctionalCriteria_rehabContinues() throws {
        var r = Fx.seeded()
        Fx.stableDays(&r, 100, 115)
        let a = Fx.attestation(in: &r, on: Fx.day(100))
        // Clinician has authorized running in principle, but criteria are not met.
        try r.addAuthorization(ClinicalAuthorization(category: .runningProgression,
                                                     approvedExercises: [ApprovedExercise(name: "Walk-jog intervals", parameters: "1 min jog / 4 min walk × 4")],
                                                     attestation: a, effectiveFrom: Fx.day(100)), now: Fx.day(100))
        try r.recordFunctionalAssessment(FunctionalAssessment(test: .hopTestSymmetry, date: Fx.day(105), passed: false, assessedBy: "Physio"))
        try r.logActivity(ActivityLogEntry(date: Fx.day(21), category: .comfortableWalking, exerciseName: "Comfortable walk", durationMinutes: 20))

        let now = Fx.day(115) // week 17
        XCTAssertEqual(r.plan.calendarWeek(on: now, calendar: Fx.calendar), 17)
        let reasons = r.access(.runningProgression, at: now).lockReasons
        XCTAssertTrue(reasons.contains(.missingFunctionalAssessment(.hopTestSymmetry)))
        XCTAssertTrue(reasons.contains(.missingFunctionalAssessment(.strengthSymmetry)))

        let weeks = r.weeklySummaries(asOf: now, calendar: Fx.calendar)
        XCTAssertEqual(weeks.count, 17)                       // plan extended, not ended
        XCTAssertTrue(weeks[16].isExtension)
        XCTAssertEqual(weeks[16].status, .current)
        XCTAssertEqual(weeks[3].completedActivities.count, 1) // week 4 history retained
        r.plan.extend(by: 4, reason: "Functional criteria not yet met", on: now)
        XCTAssertEqual(r.weeklySummaries(asOf: now, calendar: Fx.calendar).count, 20)
        XCTAssertEqual(r.weeklySummaries(asOf: now, calendar: Fx.calendar)[3].completedActivities.count, 1)
    }
}
