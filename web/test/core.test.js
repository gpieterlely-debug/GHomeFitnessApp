// Mirrors Tests/RectusRecoveryCoreTests (Swift). Run: npm test (TZ=UTC).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../core.js';

const injury = new Date(2026, 9, 22);
const day = (n, h = 9) => new Date(injury.getTime() + (n * 24 + h) * 3600e3);
const seeded = () => C.initialRecord();

function attestation(r, date, name = 'Dr. Ortho') {
  C.addDocument(r, { kind: 'clinicLetter', title: 'Clinic letter', documentDate: date.toISOString() });
  return { clinicianName: name, role: 'Orthopedic surgeon', assessmentDate: date.toISOString(),
    instructions: 'As written in letter', sourceDocumentID: r.documents.at(-1).id };
}
const checkIn = (date, o = {}) => C.validateCheckIn({
  date, restingPain: o.resting ?? 1, walkingPain: o.walking ?? 2, limp: o.limp ?? 'none', swelling: o.swelling ?? 'none',
  stiffness: 'mild', newWeakness: o.weakness ?? false, activityDurationMinutes: 20, nextDayResponse: o.nextDay ?? 'same',
  redFlags: o.redFlags ?? [] });
const stableDays = (r, from, to) => { for (let n = from; n <= to; n++) C.addCheckIn(r, checkIn(day(n))); };
const quadSet = { name: 'Quadriceps set', parameters: '5 × 10 s at 30% effort, 2×/day' };
const gluteSqueeze = { name: 'Gluteal squeeze', parameters: '5 × 10 s, 2×/day' };
const codes = (a) => (a.kind === 'locked' ? a.reasons.map((r) => r.code) : []);
const isAvail = (a) => a.kind === 'available';
const clone = (x) => structuredClone(x);

// ───────── Acceptance tests (spec §9) ─────────

test('01 no orthopedic clearance → cycling remains restricted', () => {
  const r = seeded();
  stableDays(r, 18, 21);
  const now = day(21);
  assert.equal(C.statusLabel(r, now), 'PROTECTION — AWAITING CLINICAL ASSESSMENT');
  for (const c of ['stationaryCycling', 'outdoorCycling']) assert.ok(codes(C.access(r, c, now)).includes('noClinicalAuthorization'));
  assert.throws(() => C.logActivity(r, { date: now, category: 'stationaryCycling', exerciseName: 'Stationary bike', durationMinutes: 20 }));
  C.logActivity(r, { date: now, category: 'comfortableWalking', exerciseName: 'Comfortable walk', durationMinutes: 25 });
  assert.equal(C.access(r, 'supportedUpperBody', now).kind, 'documentOnly');
});

test('02 week 6 without clearance → restricted remain locked', () => {
  const r = seeded();
  stableDays(r, 30, 37);
  const now = day(37);
  assert.equal(C.calendarWeek(r, now), 6);
  assert.equal(C.phaseAt(r, now), 'protection');
  for (const c of C.RESTRICTED) assert.ok(!isAvail(C.access(r, c, now)), c);
});

test('03 increased pain + new limp → progression paused', () => {
  const r = seeded();
  stableDays(r, 20, 24);
  const a = attestation(r, day(25));
  C.recordOrthopedicAssessment(r, { attestation: a, approvedIsometrics: [quadSet], cyclingClearance: 'stationaryOnly' }, day(25));
  C.addCheckIn(r, checkIn(day(25, 18)));
  C.recordFunctionalAssessment(r, { test: 'walkingWithoutLimp', date: day(25), passed: true, assessedBy: 'Me' });
  C.logActivity(r, { date: day(26), category: 'gentleIsometrics', exerciseName: 'Quadriceps set', durationMinutes: 10 });

  const ev = C.addCheckIn(r, checkIn(day(27), { resting: 2, walking: 4, limp: 'mild' }));
  assert.equal(ev.level, 'worsening');
  assert.match(C.evaluationMessage(ev), /Hold progression/);
  const now = day(27, 10);
  assert.ok(C.dashboard(r, now).progressionPaused);
  assert.ok(codes(C.access(r, 'stationaryCycling', now)).includes('progressionHold'));
  const iso = C.access(r, 'gentleIsometrics', now);
  assert.ok(isAvail(iso));
  assert.equal(iso.caution, C.HOLD_CAUTION);

  C.addCheckIn(r, checkIn(day(28)));
  assert.ok(C.progressionPaused(r, day(28, 10)));
  C.addCheckIn(r, checkIn(day(29)));
  C.addCheckIn(r, checkIn(day(30)));
  assert.ok(!C.progressionPaused(r, day(30, 10)));
});

test('04 clinician approves gentle isometrics → only those exercises available', () => {
  const r = seeded();
  stableDays(r, 25, 28);
  const a = attestation(r, day(28));
  C.recordOrthopedicAssessment(r, { attestation: a, tearLocation: 'Proximal direct head',
    approvedIsometrics: [quadSet, gluteSqueeze], cyclingClearance: 'notCleared' }, day(28));
  const now = day(28, 12);
  const acc = C.access(r, 'gentleIsometrics', now);
  assert.ok(isAvail(acc));
  assert.equal(acc.caution, null);
  assert.deepEqual(new Set(acc.exercises.map((x) => x.name)), new Set(['Quadriceps set', 'Gluteal squeeze']));
  assert.ok(C.libraryFor('gentleIsometrics').length > 2);
  assert.throws(() => C.logActivity(r, { date: now, category: 'gentleIsometrics', exerciseName: 'Isometric hip flexion', durationMinutes: 5 }));
  C.logActivity(r, { date: now, category: 'gentleIsometrics', exerciseName: 'Quadriceps set', durationMinutes: 5 });
  for (const c of C.RESTRICTED.filter((c) => c !== 'gentleIsometrics')) assert.ok(!isAvail(C.access(r, c, now)), c);
  assert.equal(C.statusLabel(r, now), 'PROTECTION — CLINICIAN-DIRECTED');
});

test('05 misses two weeks → no automatic phase advance', () => {
  const r = seeded();
  stableDays(r, 25, 28);
  const a = attestation(r, day(28));
  C.recordOrthopedicAssessment(r, { attestation: a, approvedIsometrics: [quadSet] }, day(28));
  C.recordPhaseChange(r, { phase: 'earlyLoading', effectiveDate: day(28).toISOString(), attestation: a }, day(28));
  const back = day(43);
  assert.equal(C.phaseAt(r, back), 'earlyLoading');
  assert.equal(r.phaseChanges.length, 1);
  assert.deepEqual(codes(C.access(r, 'gentleIsometrics', back)), ['noRecentSymptomCheckIn']);
  assert.ok(C.dashboard(r, back).checkInDueToday);
  C.addCheckIn(r, checkIn(back));
  assert.ok(isAvail(C.access(r, 'gentleIsometrics', new Date(back.getTime() + 60e3))));
  assert.equal(C.phaseAt(r, back), 'earlyLoading');
});

test('06 Apple Health reports a 30 km ride → recorded, not clearance', () => {
  const r = seeded();
  stableDays(r, 18, 21);
  const before = clone(r);
  const xml = `<HealthData><ExportDate value="2026-11-12 09:00:00 +0000"/>
<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" sourceName="Apple Watch" startDate="2026-11-12 07:00:00 +0000" endDate="2026-11-12 08:00:00 +0000">
 <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" startDate="x" endDate="y" sum="30" unit="km"/>
</Workout></HealthData>`;
  const p = C.createHealthParser(); p.push(xml);
  C.replaceHealthData(r, p.finish(), day(21));
  assert.equal(r.health.workouts.length, 1);
  assert.equal(r.health.workouts[0].distanceMetres, 30000);
  const now = day(21, 10);
  for (const c of ['stationaryCycling', 'outdoorCycling']) assert.ok(codes(C.access(r, c, now)).includes('noClinicalAuthorization'));
  for (const k of ['authorizations', 'completions', 'functionalAssessments', 'phaseChanges', 'activityLog', 'holds'])
    assert.deepEqual(r[k], before[k], k);
  assert.equal(C.statusLabel(r, now), 'PROTECTION — AWAITING CLINICAL ASSESSMENT');
  assert.ok(!('health' in C.clinicalEvidence(r)), 'engine evidence must not include health data');
});

test('07 week 16 without functional criteria → rehab continues', () => {
  const r = seeded();
  stableDays(r, 100, 115);
  const a = attestation(r, day(100));
  C.addAuthorization(r, { category: 'runningProgression', approvedExercises: [{ name: 'Walk-jog intervals', parameters: '1 min jog / 4 min walk × 4' }],
    attestation: a, effectiveFrom: day(100).toISOString() }, day(100));
  C.recordFunctionalAssessment(r, { test: 'hopTestSymmetry', date: day(105), passed: false, assessedBy: 'Me' });
  C.logActivity(r, { date: day(21), category: 'comfortableWalking', exerciseName: 'Comfortable walk', durationMinutes: 20 });
  const now = day(115);
  assert.equal(C.calendarWeek(r, now), 17);
  const rs = C.access(r, 'runningProgression', now).reasons;
  assert.ok(rs.some((x) => x.code === 'missingFunctionalAssessment' && x.test === 'hopTestSymmetry'));
  assert.ok(rs.some((x) => x.code === 'missingFunctionalAssessment' && x.test === 'strengthSymmetry'));
  let weeks = C.weeklySummaries(r, now);
  assert.equal(weeks.length, 17);
  assert.ok(weeks[16].isExtension);
  assert.equal(weeks[16].status, 'current');
  assert.equal(weeks[3].completedActivities.length, 1);
  C.extendPlan(r, 4, 'Functional criteria not yet met', now);
  weeks = C.weeklySummaries(r, now);
  assert.equal(weeks.length, 20);
  assert.equal(weeks[3].completedActivities.length, 1);
});

// ───────── Safety ─────────

test('seed matches v2.1 configuration', () => {
  const r = seeded();
  assert.equal(r.configurationVersion, '2.1');
  assert.equal(r.profile.side, 'left');
  assert.equal(r.profile.orthopedicStatus, 'awaitingAssessment');
  assert.equal(r.profile.physiotherapyStatus, 'notStarted');
  assert.equal(r.profile.treatmentPathway, 'notYetConfirmed');
  assert.deepEqual(r.profile.availableKettlebellsKg, [8, 12, 16, 18, 20, 24, 28]);
  assert.equal(r.plan.provisionalWeeks, 16);
  assert.equal(C.calendarWeek(r, new Date(2026, 10, 12)), 4);
  assert.equal(r.authorizations.length, 0);
  assert.equal(r.appointments[0].questions.length, C.ORTHO_QUESTIONS.length);
  assert.ok(C.pendingMilestones(r, day(21)).some((m) => m.startsWith('Orthopedic assessment — booked')));
});

test('Nov 19 visit: reminders, findings prompt, still locked after', () => {
  const r = seeded();
  const visit = new Date(2026, 10, 19, 9).getTime();
  assert.equal(new Date(r.appointments[0].scheduledAt).getTime(), visit);
  assert.equal(C.calendarWeek(r, new Date(visit)), 5);
  const rem = C.reminders(r.appointments, day(21)).map((x) => new Date(x.fireDate).getTime());
  assert.deepEqual(rem, [visit - 72 * 3600e3, visit - 24 * 3600e3, visit - 2 * 3600e3, visit + 2 * 3600e3]);
  const after = day(29);
  assert.ok(C.pendingMilestones(r, after).includes('Enter specialist findings: Orthopedic assessment'));
  assert.equal(C.statusLabel(r, after), 'PROTECTION — AWAITING CLINICAL ASSESSMENT');
  assert.ok(C.RESTRICTED.every((c) => !isAvail(C.access(r, c, after))));
});

test('check-in requires every field and valid ranges', () => {
  assert.throws(() => C.validateCheckIn({ date: day(21), restingPain: 1 }), (e) => e.code === 'missingFields' && e.detail.length === 7);
  assert.throws(() => C.validateCheckIn({ date: day(21), restingPain: 11, walkingPain: 2, limp: 'none', swelling: 'none',
    stiffness: 'none', newWeakness: false, activityDurationMinutes: 0, nextDayResponse: 'same' }), /0–10/);
});

test('red flag is urgent, blocks started activity, released only by review', () => {
  const r = seeded();
  stableDays(r, 25, 28);
  const a = attestation(r, day(28));
  C.recordOrthopedicAssessment(r, { attestation: a, approvedIsometrics: [quadSet] }, day(28));
  C.logActivity(r, { date: day(28, 12), category: 'gentleIsometrics', exerciseName: 'Quadriceps set', durationMinutes: 5 });
  const e = C.addCheckIn(r, checkIn(day(29), { redFlags: ['newPopOrPalpableGap'] }));
  assert.equal(e.level, 'urgent');
  assert.match(C.evaluationMessage(e), /^URGENT/);
  assert.ok(codes(C.access(r, 'gentleIsometrics', day(29, 10))).includes('urgentSymptoms'));
  stableDays(r, 30, 34);
  assert.ok(C.progressionPaused(r, day(34, 10)));
  const rev = attestation(r, day(34, 11));
  C.recordClinicalReview(r, { attestation: rev, outcome: 'Re-imaged; no new tear' }, day(34, 12));
  assert.ok(!C.progressionPaused(r, day(34, 12)));
});

test('rapid rise within 48 h is urgent', () => {
  const r = seeded();
  stableDays(r, 20, 24);
  assert.equal(C.addCheckIn(r, checkIn(day(25), { walking: 5 })).level, 'urgent');
});

test('stable pain is not a healing claim', () => {
  assert.match(C.TREND_CAPTION, /do not show how well the tendon has healed/);
  assert.match(C.evaluationMessage({ level: 'stable', reasons: [] }), /does not prove/);
});

test('authorization needs clinician name, stored source document, non-future date', () => {
  const r = seeded();
  const date = day(21);
  assert.throws(() => C.addAuthorization(r, { category: 'stationaryCycling', approvedExercises: [],
    attestation: { clinicianName: 'Dr', assessmentDate: date.toISOString(), sourceDocumentID: 'nope' }, effectiveFrom: date.toISOString() }, date),
    (e) => e.code === 'missingSourceDocument');
  const a = { ...attestation(r, date), clinicianName: '  ' };
  assert.throws(() => C.recordOrthopedicAssessment(r, { attestation: a }, date), (e) => e.code === 'missingClinicianName');
  const f = attestation(r, day(40));
  assert.throws(() => C.recordPhaseChange(r, { phase: 'strengthening', effectiveDate: day(40).toISOString(), attestation: f }, date),
    (e) => e.code === 'futureDate');
});

test('"not addressed" fields unlock nothing', () => {
  const r = seeded();
  stableDays(r, 25, 28);
  C.recordOrthopedicAssessment(r, { attestation: attestation(r, day(28)) }, day(28));
  assert.equal(r.authorizations.length, 0);
  assert.ok(C.RESTRICTED.every((c) => !isAvail(C.access(r, c, day(28, 12)))));
  assert.ok(C.pendingMilestones(r, day(28, 12)).some((m) => m.startsWith('Review written restrictions')));
});

test('prerequisites and functional tests gate progression; failed retest re-locks', () => {
  const r = seeded();
  stableDays(r, 50, 56);
  const a = attestation(r, day(50));
  C.addAuthorization(r, { category: 'controlledHipKneeStrengthening', approvedExercises: [{ name: 'Bridge', parameters: '3×10' }],
    attestation: a, effectiveFrom: day(50).toISOString() }, day(50));
  const now = day(56, 12);
  assert.deepEqual(new Set(codes(C.access(r, 'controlledHipKneeStrengthening', now))),
    new Set(['missingPrerequisite', 'missingFunctionalAssessment']));
  C.recordCompletion(r, { category: 'gentleIsometrics', completedOn: day(52), documentedBy: 'Me' });
  C.recordFunctionalAssessment(r, { test: 'walkingWithoutLimp', date: day(52), passed: true, assessedBy: 'Me' });
  C.recordFunctionalAssessment(r, { test: 'painFreeStraightLegRaise', date: day(52), passed: true, assessedBy: 'Me' });
  assert.ok(isAvail(C.access(r, 'controlledHipKneeStrengthening', now)));
  C.recordFunctionalAssessment(r, { test: 'painFreeStraightLegRaise', date: day(55), passed: false, assessedBy: 'Me' });
  assert.ok(!isAvail(C.access(r, 'controlledHipKneeStrengthening', now)));
});

test('self-assessed tests count unless clinician-run tests are required', () => {
  const r = seeded();
  stableDays(r, 60, 63);
  const a = attestation(r, day(60));
  C.addAuthorization(r, { category: 'stationaryCycling', approvedExercises: [{ name: 'Stationary bike', parameters: '10 min' }],
    attestation: a, effectiveFrom: day(60).toISOString() }, day(60));
  C.recordFunctionalAssessment(r, { test: 'walkingWithoutLimp', date: day(61), passed: true, assessedBy: 'Me' });
  assert.equal(r.functionalAssessments[0].assessorRole, 'patientSelfAssessed');
  const now = day(63, 12);
  assert.ok(isAvail(C.access(r, 'stationaryCycling', now)));
  r.rules.clinicianAssessmentRequiredFor = ['stationaryCycling'];
  assert.deepEqual(codes(C.access(r, 'stationaryCycling', now)), ['clinicianAssessmentRequired']);
});

test('revoked authorization re-locks and history is kept', () => {
  const r = seeded();
  stableDays(r, 25, 30);
  C.recordOrthopedicAssessment(r, { attestation: attestation(r, day(25)), approvedIsometrics: [quadSet] }, day(25));
  C.revokeAuthorization(r, r.authorizations[0].id, day(29), 'Surgery scheduled');
  assert.deepEqual(codes(C.access(r, 'gentleIsometrics', day(30, 12))), ['authorizationExpiredOrRevoked']);
  assert.equal(r.authorizations.length, 1);
});

test('cannot authorize upper body as a clinical category; upper body is documented only', () => {
  const r = seeded();
  assert.throws(() => C.addAuthorization(r, { category: 'supportedUpperBody', approvedExercises: [],
    attestation: attestation(r, day(21)), effectiveFrom: day(21).toISOString() }, day(21)));
  C.logActivity(r, { date: day(21), category: 'supportedUpperBody', exerciseName: 'Seated DB press', durationMinutes: 20 });
  assert.equal(C.dashboard(r, day(21)).available.supportedUpperBody, undefined);
});

// ───────── Health import, calendar, backup ─────────

const HK = `<?xml version="1.0"?>
<HealthData locale="en_US">
 <ExportDate value="2026-11-12 21:00:00 +0100"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-11-12 08:00:00 +0100" endDate="2026-11-12 09:00:00 +0100" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-11-12 08:00:00 +0100" endDate="2026-11-12 09:00:00 +0100" value="3200">
  <MetadataEntry key="x" value="y"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-11-12 18:00:00 +0100" endDate="2026-11-12 19:00:00 +0100" value="800"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2025-01-01 08:00:00 +0100" endDate="2025-01-01 09:00:00 +0100" value="99999"/>
 <Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="Apple Watch" unit="km" startDate="2026-11-12 08:00:00 +0100" endDate="2026-11-12 09:00:00 +0100" value="2.5"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-11-12 08:00:00 +0100" endDate="2026-11-12 08:00:00 +0100" value="60"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-11-12 08:05:00 +0100" endDate="2026-11-12 08:05:00 +0100" value="100"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-11-11 23:00:00 +0100" endDate="2026-11-12 03:00:00 +0100" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-11-12 03:00:00 +0100" endDate="2026-11-12 03:30:00 +0100" value="HKCategoryValueSleepAnalysisAwake"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" sourceName="Apple Watch" startDate="2026-11-12 07:00:00 +0100" endDate="2026-11-12 08:00:00 +0100">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" sum="30" unit="km"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="58" durationUnit="min" sourceName="Strava" startDate="2026-11-12 07:02:00 +0100" endDate="2026-11-12 08:00:00 +0100" totalDistance="29.8" totalDistanceUnit="km"/>
</HealthData>`;

test('health export parses identically however it is chunked', () => {
  const whole = C.createHealthParser({ since: new Date(2026, 8, 22) }); whole.push(HK);
  const ref = whole.finish();
  for (const size of [7, 50, 113, 400]) {
    const p = C.createHealthParser({ since: new Date(2026, 8, 22) });
    for (let i = 0; i < HK.length; i += size) p.push(HK.slice(i, i + size));
    assert.deepEqual(p.finish(), ref, `chunk ${size}`);
  }
  assert.equal(ref.exportDate, '2026-11-12T21:00:00+01:00');
  assert.equal(ref.daily['steps|2026-11-12'].value, 4000);          // largest source (Watch), not 7000
  assert.equal(ref.daily['steps|2025-01-01'], undefined);           // before cut-off
  assert.equal(ref.daily['walkingRunningDistance|2026-11-12'].value, 2500);
  assert.equal(ref.daily['heartRate|2026-11-12'].value, 80);
  assert.equal(ref.daily['heartRate|2026-11-12'].max, 100);
  assert.equal(ref.daily['sleep|2026-11-12'].value, 240);           // awake excluded
  assert.equal(ref.workouts.length, 1);                             // Strava duplicate dropped
  assert.equal(ref.workouts[0].distanceMetres, 30000);
});

test('missing health data is undefined, not zero; re-import replaces', () => {
  const r = seeded();
  assert.equal(C.dailyValue(r, 'steps', '2026-11-12'), undefined);
  const p = C.createHealthParser(); p.push(HK);
  const parsed = p.finish();
  C.replaceHealthData(r, parsed, day(21));
  C.replaceHealthData(r, parsed, day(22));
  assert.equal(r.health.workouts.length, 1);
  assert.equal(C.dailyValue(r, 'steps', '2026-11-12').value, 4000);
});

test('calendar file has visit alarms, findings prompt and daily check-in', () => {
  const r = seeded();
  const ics = C.buildICS(r, day(21));
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:20261119T090000Z/);
  for (const h of [72, 24, 2]) assert.ok(ics.includes(`TRIGGER:-PT${h}H`));
  assert.match(ics, /SUMMARY:Record specialist findings/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.ok(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length === 3);
});

test('record survives JSON round-trip and migration fills new fields', () => {
  const r = seeded();
  stableDays(r, 18, 21);
  const back = C.migrate(JSON.parse(JSON.stringify(r)));
  assert.deepEqual(back, r);
  const old = JSON.parse(JSON.stringify(r));
  delete old.health; delete old.rules.clinicianAssessmentRequiredFor;
  const m = C.migrate(old);
  assert.deepEqual(m.health, C.emptyHealth());
  assert.deepEqual(m.rules.clinicianAssessmentRequiredFor, []);
});

test('same-timestamp entries: the most recently entered one counts', () => {
  const r = seeded();
  const t = day(22);
  C.addCheckIn(r, checkIn(t));
  C.addCheckIn(r, checkIn(t, { resting: 2, walking: 5, limp: 'mild' }));
  assert.equal(C.latestEvaluation(r, t).level, 'worsening');
  assert.ok(C.progressionPaused(r, t));
  C.recordFunctionalAssessment(r, { test: 'walkingWithoutLimp', date: t, passed: true, assessedBy: 'Me' });
  C.recordFunctionalAssessment(r, { test: 'walkingWithoutLimp', date: t, passed: false, assessedBy: 'Me' });
  const a = attestation(r, t);
  C.addAuthorization(r, { category: 'stationaryCycling', approvedExercises: [{ name: 'Stationary bike', parameters: '10 min' }],
    attestation: a, effectiveFrom: t.toISOString() }, t);
  assert.ok(C.access(r, 'stationaryCycling', t).reasons.some((x) => x.code === 'missingFunctionalAssessment'));
});
