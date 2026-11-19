// Rectus Recovery — clinical core (web).
// Mirrors Sources/RectusRecoveryCore (Swift). Same rules, same acceptance tests.
// Pure functions + in-place mutations of a JSON-serialisable record. No DOM, no storage.
// Dates in the record are ISO strings.

export const CONFIG_VERSION = '2.1';

// ───────────────────────── Categories ─────────────────────────

export const CATEGORIES = [
  ['comfortableWalking', 'Comfortable walking', 'permitted'],
  ['supportedAnkleMobility', 'Gentle supported ankle mobility', 'permitted'],
  ['supportedUpperBody', 'Supported upper-body exercise', 'documentOnly'],
  ['gentleIsometrics', 'Gentle isometric strengthening', 'restricted'],
  ['controlledHipKneeStrengthening', 'Controlled hip and knee strengthening', 'restricted'],
  ['hipFlexorStrengthening', 'Hip-flexor strengthening', 'restricted'],
  ['progressiveLowerBodyResistance', 'Progressive lower-body resistance', 'restricted'],
  ['stationaryCycling', 'Stationary cycling', 'restricted'],
  ['outdoorCycling', 'Outdoor cycling', 'restricted'],
  ['runningProgression', 'Running progression', 'restricted'],
  ['dynamicKettlebell', 'Dynamic kettlebell exercises', 'restricted'],
  ['soccerSpecific', 'Soccer-specific movement (incl. kicking)', 'restricted'],
].map(([key, name, baseline]) => ({ key, name, baseline }));

export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
export const RESTRICTED = CATEGORIES.filter((c) => c.baseline === 'restricted').map((c) => c.key);
export const catName = (k) => CAT[k]?.name ?? k;

// ───────────────────────── Functional tests ─────────────────────────

export const TESTS = {
  walkingWithoutLimp: 'Walking without limp',
  painFreeStraightLegRaise: 'Pain-free straight-leg raise',
  fullPainFreeHipKneeRange: 'Full, pain-free hip and knee range of motion',
  painFreeIsometricHipFlexion: 'Pain-free isometric hip flexion',
  singleLegSquatControl: 'Single-leg squat control',
  strengthSymmetry: 'Hip-flexor / knee-extensor strength symmetry (clinician-set target)',
  hopTestSymmetry: 'Hop test symmetry (clinician-set target)',
  painFreeSprinting: 'Pain-free graded sprinting',
};

// ASSUMPTION: default progression map — an app scaffold for discussion with the
// clinician, not clinical guidance. Replaceable per record.
export function defaultRules() {
  const r = (prerequisites, requiredAssessments) => ({ prerequisites, requiredAssessments });
  return {
    rules: {
      gentleIsometrics: r([], []),
      controlledHipKneeStrengthening: r(['gentleIsometrics'], ['walkingWithoutLimp', 'painFreeStraightLegRaise']),
      hipFlexorStrengthening: r(['gentleIsometrics'], ['painFreeIsometricHipFlexion']),
      progressiveLowerBodyResistance: r(['controlledHipKneeStrengthening'], ['fullPainFreeHipKneeRange', 'singleLegSquatControl']),
      stationaryCycling: r([], ['walkingWithoutLimp']),
      outdoorCycling: r(['stationaryCycling'], ['singleLegSquatControl']),
      runningProgression: r(['progressiveLowerBodyResistance'], ['strengthSymmetry', 'hopTestSymmetry']),
      dynamicKettlebell: r(['progressiveLowerBodyResistance'], ['singleLegSquatControl', 'strengthSymmetry']),
      soccerSpecific: r(['runningProgression', 'hipFlexorStrengthening'], ['strengthSymmetry', 'hopTestSymmetry', 'painFreeSprinting']),
    },
    symptomRecencyHours: 72,
    stableCheckInsToReleaseHold: 3, // confirmed by patient, v2.1
    clinicianAssessmentRequiredFor: [], // patient runs tests (confirmed v2.1)
  };
}

const ruleFor = (record, cat) => record.rules.rules[cat] ?? { prerequisites: [], requiredAssessments: [] };

// ───────────────────────── Library (demonstrations) ─────────────────────────

export const LIBRARY = [
  ['Comfortable walk', 'comfortableWalking', 'Flat ground, normal pace, stop before limping.'],
  ['Seated ankle pumps', 'supportedAnkleMobility', 'Seated, leg supported; move ankle up and down slowly.'],
  ['Seated ankle circles', 'supportedAnkleMobility', 'Seated, leg supported; slow circles each direction.'],
  ['Quadriceps set', 'gentleIsometrics', 'Lying, knee straight; gently tighten thigh, hold, relax.'],
  ['Gluteal squeeze', 'gentleIsometrics', 'Lying; squeeze buttocks gently, hold, relax.'],
  ['Isometric hip adduction (ball squeeze)', 'gentleIsometrics', 'Lying, knees bent; gently squeeze a soft ball.'],
  ['Isometric hip abduction', 'gentleIsometrics', 'Lying, knees bent with band; press gently outward.'],
  ['Isometric hip flexion', 'gentleIsometrics', 'Only if specifically approved — loads the injured tendon directly.'],
  ['Stationary bike', 'stationaryCycling', 'Seat height, resistance and duration exactly as cleared.'],
].map(([name, category, demonstration]) => ({ name, category, demonstration }));

export const libraryFor = (cat) => LIBRARY.filter((e) => e.category === cat);

// ───────────────────────── Symptoms ─────────────────────────

export const LIMP = ['none', 'mild', 'marked', 'unableToBearWeight'];
export const SEVERITY = ['none', 'mild', 'moderate', 'severe'];
export const NEXT_DAY = ['better', 'same', 'worse', 'noActivityYesterday'];
export const RED_FLAGS = {
  newPopOrPalpableGap: 'New pop, sudden give-way, or a gap you can feel',
  unableToBearWeight: 'Cannot put weight on the leg',
  rapidlyIncreasingSwellingOrBruising: 'Rapidly increasing swelling or bruising',
  numbnessTinglingOrColdLeg: 'Numbness, tingling, or a cold/pale leg',
  calfPainSwellingOrWarmth: 'Calf pain, swelling, or warmth',
  feverOrSpreadingRedness: 'Fever or spreading redness',
  chestPainOrShortnessOfBreath: 'Chest pain or shortness of breath',
};

export const URGENT_MESSAGE =
  'URGENT: Stop activity. Seek same-day medical assessment (urgent care or emergency department). ' +
  'Call your local emergency number for chest pain, shortness of breath, a cold or numb leg, or if you cannot bear weight.';
export const HOLD_CAUTION =
  'Symptoms worsened: continue only as your clinician directed. Do not increase load, range, duration, or speed until reviewed.';
export const TREND_CAPTION = 'Pain scores show how symptoms change. They do not show how well the tendon has healed.';

const LEVEL = { stable: 0, worsening: 1, urgent: 2 };

export class ClinicalError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const iso = (d) => new Date(ms(d)).toISOString();
const uuid = () => globalThis.crypto.randomUUID();
const blank = (s) => !s || !String(s).trim();
/** Latest item by date at or before `t`; on equal dates the most recently entered wins. */
const latestBy = (items, key, t = Infinity) =>
  items.reduce((best, x) => (ms(x[key]) <= t && (!best || ms(x[key]) >= ms(best[key])) ? x : best), null);

/** Validates a check-in draft. Every required field must be present. */
export function validateCheckIn(d) {
  const required = [
    ['restingPain', 'resting pain'], ['walkingPain', 'walking pain'], ['limp', 'limp status'],
    ['swelling', 'swelling'], ['stiffness', 'stiffness'], ['newWeakness', 'new weakness'],
    ['activityDurationMinutes', 'activity duration'], ['nextDayResponse', 'next-day symptom response'],
  ];
  const missing = required.filter(([k]) => d[k] === undefined || d[k] === null || d[k] === '').map(([, l]) => l);
  if (missing.length) throw new ClinicalError('missingFields', `Missing required fields: ${missing.join(', ')}.`, missing);
  const rp = Number(d.restingPain), wp = Number(d.walkingPain), dur = Number(d.activityDurationMinutes);
  if (!(rp >= 0 && rp <= 10 && Number.isInteger(rp))) throw new ClinicalError('range', 'Resting pain must be 0–10.');
  if (!(wp >= 0 && wp <= 10 && Number.isInteger(wp))) throw new ClinicalError('range', 'Walking pain must be 0–10.');
  if (!(dur >= 0)) throw new ClinicalError('range', 'Activity duration must be 0 or more.');
  if (!LIMP.includes(d.limp) || !SEVERITY.includes(d.swelling) || !SEVERITY.includes(d.stiffness) || !NEXT_DAY.includes(d.nextDayResponse))
    throw new ClinicalError('range', 'Invalid option selected.');
  return {
    id: uuid(), date: iso(d.date ?? new Date()), restingPain: rp, walkingPain: wp, limp: d.limp,
    swelling: d.swelling, stiffness: d.stiffness, newWeakness: d.newWeakness === true || d.newWeakness === 'true',
    activityDurationMinutes: dur, nextDayResponse: d.nextDayResponse,
    redFlags: (d.redFlags ?? []).filter((f) => f in RED_FLAGS), notes: d.notes ?? '',
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function baseline(latest, history, profile) {
  const prior = history.filter((c) => ms(c.date) < ms(latest.date)).sort((a, b) => ms(a.date) - ms(b.date)).slice(-7);
  if (!prior.length) return { walking: profile.baselineWalkingPain, resting: profile.baselineRestingPain, limp: 0, swelling: 0 };
  return {
    walking: median(prior.map((c) => c.walkingPain)),
    resting: median(prior.map((c) => c.restingPain)),
    limp: median(prior.map((c) => LIMP.indexOf(c.limp))),
    swelling: median(prior.map((c) => SEVERITY.indexOf(c.swelling))),
  };
}

// ASSUMPTION: thresholds are conservative app defaults, not validated clinical cut-offs.
export function evaluate(latest, history, profile) {
  const b = baseline(latest, history, profile);
  const prev = history.filter((c) => ms(c.date) < ms(latest.date)).sort((a, b2) => ms(a.date) - ms(b2.date)).at(-1);
  const urgent = [...latest.redFlags].sort().map((f) => `Red flag: ${RED_FLAGS[f]}`);
  if (latest.restingPain >= 7) urgent.push(`Resting pain ${latest.restingPain}/10`);
  if (latest.walkingPain >= 8) urgent.push(`Walking pain ${latest.walkingPain}/10`);
  if (latest.limp === 'unableToBearWeight') urgent.push('Unable to bear weight');
  if (latest.walkingPain - b.walking >= 4) urgent.push(`Walking pain up ${latest.walkingPain - b.walking} points from baseline`);
  if (prev && ms(latest.date) - ms(prev.date) <= 48 * 3600e3 &&
      (latest.walkingPain - prev.walkingPain >= 3 || latest.restingPain - prev.restingPain >= 3))
    urgent.push('Pain rose 3+ points within 48 hours');
  if (latest.swelling === 'severe') urgent.push('Severe swelling');
  if (urgent.length) return { level: 'urgent', reasons: urgent };

  const worse = [];
  if (latest.walkingPain - b.walking >= 2) worse.push(`Walking pain up ${latest.walkingPain - b.walking} points from baseline`);
  if (latest.restingPain - b.resting >= 2) worse.push(`Resting pain up ${latest.restingPain - b.resting} points from baseline`);
  if (LIMP.indexOf(latest.limp) > b.limp) worse.push('New or worse limp');
  if (latest.newWeakness) worse.push('New weakness');
  if (SEVERITY.indexOf(latest.swelling) > b.swelling) worse.push('More swelling than baseline');
  if (latest.nextDayResponse === 'worse') worse.push('Worse the day after activity');
  if (worse.length) return { level: 'worsening', reasons: worse };
  return { level: 'stable', reasons: [] };
}

export function evaluationMessage(e) {
  if (e.level === 'urgent') return URGENT_MESSAGE;
  if (e.level === 'worsening')
    return 'Symptoms are worse. Hold progression: do not add load, distance, or new activities. Contact your orthopedic specialist or physiotherapist for review.';
  return 'Symptoms stable compared with your recent baseline. Stable pain does not prove the tendon has healed.';
}

export function trendSeries(checkIns) {
  const s = [...checkIns].sort((a, b) => ms(a.date) - ms(b.date));
  return s.map((c) => {
    const w = s.filter((x) => ms(x.date) <= ms(c.date) && ms(c.date) - ms(x.date) < 7 * 864e5);
    return { date: c.date, walkingPain: c.walkingPain, restingPain: c.restingPain,
      walkingPain7DayAverage: w.reduce((a, x) => a + x.walkingPain, 0) / w.length };
  });
}

// ───────────────────────── Record ─────────────────────────

export const ORTHO_QUESTIONS = [
  'Exactly where is the tear (proximal, mid-substance, myotendinous junction; direct or indirect head)?',
  'How much of the tendon is involved, and is there any retraction or gap?',
  'Is surgery an option or recommended? Does waiting change the surgical options or outcome?',
  'Do I need repeat imaging, and when?',
  'What are my weight-bearing instructions? Do I need crutches?',
  'What hip and knee range of motion is allowed, and what should I avoid (e.g., hip extension with knee bend)?',
  'Which isometric exercises may I start, at what effort, sets and holds?',
  'Am I cleared for stationary cycling? If yes: seat height, resistance, duration.',
  'What lower-body strength training is restricted, and until when?',
  'Can I do supported upper-body training, including kettlebell work? Which positions are off-limits?',
  'Will you refer me to physiotherapy? Who and when?',
  'Which symptoms should make me stop and call you?',
  'I will run my own functional tests. Which should a clinician run instead (strength, hop symmetry)?',
  'When is my follow-up, and can I have these restrictions in writing?',
];

export function initialRecord() {
  const injury = new Date(2026, 9, 22);
  return {
    schemaVersion: 1,
    configurationVersion: CONFIG_VERSION,
    profile: {
      injuryDate: iso(injury),
      side: 'left',
      diagnosis: 'High-grade partial left rectus femoris tendon tear with associated rectus femoris and iliopsoas muscle injury',
      imagingSummary: 'MRI: mild tendon laxity without complete retraction',
      baselineWalkingPain: 3, // reported 2–3/10; upper value used (conservative)
      baselineRestingPain: 0, // ASSUMPTION: not reported; confirm at first check-in
      toleratedActivities: ['Walking'],
      goals: ['Return to cycling', 'Return to running', 'Return to kettlebell workouts', 'Kick a soccer ball'],
      availableKettlebellsKg: [8, 12, 16, 18, 20, 24, 28],
      orthopedicStatus: 'awaitingAssessment',
      physiotherapyStatus: 'notStarted',
      treatmentPathway: 'notYetConfirmed',
    },
    plan: { startDate: iso(injury), provisionalWeeks: 16, extensions: [] },
    documents: [], checkIns: [], holds: [], reviews: [], orthopedicAssessments: [], restrictionsReviewed: {},
    authorizations: [], functionalAssessments: [], completions: [], phaseChanges: [], activityLog: [],
    appointments: [{
      id: uuid(), kind: 'orthopedic', title: 'Orthopedic assessment',
      scheduledAt: iso(new Date(2026, 10, 19, 9)), // ASSUMPTION: 09:00 placeholder
      clinicianName: null, reminderOffsetsHours: [72, 24, 2],
      questions: ORTHO_QUESTIONS.map((q) => ({ id: uuid(), question: q, answer: '' })),
      findingsRecordedAt: null,
    }],
    rules: defaultRules(),
    health: emptyHealth(),
    meta: { lastBackupAt: null },
  };
}

function validateAttestation(record, a, now) {
  if (blank(a.clinicianName)) throw new ClinicalError('missingClinicianName', 'Clinician name is required.');
  if (!record.documents.some((d) => d.id === a.sourceDocumentID))
    throw new ClinicalError('missingSourceDocument', 'A stored source document (letter, report, written restrictions) is required.');
  if (ms(a.assessmentDate) > ms(now)) throw new ClinicalError('futureDate', 'Assessment date cannot be in the future.');
}

export const addDocument = (record, doc) => record.documents.push({ id: uuid(), addedAt: iso(new Date()), ...doc });
export const addAppointment = (record, a) => record.appointments.push({
  id: uuid(), reminderOffsetsHours: [72, 24, 2], questions: [], findingsRecordedAt: null, clinicianName: null, ...a });
export function updateAppointment(record, a) {
  const i = record.appointments.findIndex((x) => x.id === a.id);
  if (i >= 0) record.appointments[i] = a;
}

/** Stores a check-in, evaluates it, opens/escalates/releases holds. Returns the evaluation. */
export function addCheckIn(record, c) {
  record.checkIns.push(c);
  const ev = evaluate(c, record.checkIns, record.profile);
  const open = record.holds.filter((h) => !h.releasedAt && ms(h.startedAt) <= ms(c.date));
  if (LEVEL[ev.level] >= LEVEL.worsening) {
    const h = open.at(-1);
    if (h) {
      if (LEVEL[ev.level] > LEVEL[h.level]) h.level = ev.level;
      for (const r of ev.reasons) if (!h.reasons.includes(r)) h.reasons.push(r);
    } else {
      record.holds.push({ id: uuid(), startedAt: c.date, level: ev.level, reasons: ev.reasons,
        triggeringCheckInID: c.id, releasedAt: null, releaseReason: null });
    }
  } else {
    // Non-urgent holds release after N consecutive stable check-ins; urgent only via documented review.
    const n = record.rules.stableCheckInsToReleaseHold;
    for (const h of open.filter((x) => x.level === 'worsening')) {
      const tail = record.checkIns.filter((x) => ms(x.date) > ms(h.startedAt) && ms(x.date) <= ms(c.date))
        .sort((a, b) => ms(a.date) - ms(b.date)).slice(-n);
      if (tail.length === n && tail.every((x) => evaluate(x, record.checkIns, record.profile).level === 'stable')) {
        h.releasedAt = c.date;
        h.releaseReason = `${n} consecutive stable check-ins`;
      }
    }
  }
  return ev;
}

export function derivedAuthorizations(a) {
  const at = a.attestation, out = [];
  const auth = (category, approvedExercises, expiresOn = null) => ({ id: uuid(), category, approvedExercises,
    attestation: at, effectiveFrom: at.assessmentDate, expiresOn, revokedOn: null, revocationReason: null });
  if (a.approvedIsometrics?.length) out.push(auth('gentleIsometrics', a.approvedIsometrics));
  const dose = a.cyclingConditions || 'As instructed by clinician';
  if (a.cyclingClearance === 'stationaryOnly' || a.cyclingClearance === 'stationaryAndOutdoor')
    out.push(auth('stationaryCycling', [{ name: 'Stationary bike', parameters: dose }]));
  if (a.cyclingClearance === 'stationaryAndOutdoor') out.push(auth('outdoorCycling', [{ name: 'Outdoor ride', parameters: dose }]));
  for (const x of a.additionalApprovals ?? [])
    if (CAT[x.category]?.baseline === 'restricted') out.push(auth(x.category, x.exercises, x.expiresOn ?? null));
  return out;
}

/** Only what the clinician explicitly wrote unlocks anything. "Not addressed" unlocks nothing. */
export function recordOrthopedicAssessment(record, a, now) {
  validateAttestation(record, a.attestation, now);
  const full = { id: uuid(), surgery: 'notAddressed', weightBearing: 'notAddressed', cyclingClearance: 'notAddressed',
    approvedIsometrics: [], additionalApprovals: [], ...a };
  record.orthopedicAssessments.push(full);
  record.authorizations.push(...derivedAuthorizations(full));
  record.profile.orthopedicStatus = 'assessed';
  if (full.physiotherapyReferral === true && record.profile.physiotherapyStatus === 'notStarted') record.profile.physiotherapyStatus = 'referred';
  if (full.treatmentPathway) record.profile.treatmentPathway = full.treatmentPathway;
  for (const ap of record.appointments)
    if (ap.kind === 'orthopedic' && !ap.findingsRecordedAt && ap.scheduledAt && ms(ap.scheduledAt) <= ms(now)) ap.findingsRecordedAt = iso(now);
  if (full.followUpDate)
    addAppointment(record, { kind: 'orthopedic', title: 'Orthopedic follow-up', scheduledAt: iso(full.followUpDate),
      clinicianName: full.attestation.clinicianName, questions: ORTHO_QUESTIONS.map((q) => ({ id: uuid(), question: q, answer: '' })) });
  return full;
}

export const markRestrictionsReviewed = (record, id, date) => { record.restrictionsReviewed[id] = iso(date); };

export function addAuthorization(record, a, now) {
  if (CAT[a.category]?.baseline !== 'restricted')
    throw new ClinicalError('notAClinicalCategory', `${catName(a.category)} does not need clinical authorization.`);
  validateAttestation(record, a.attestation, now);
  const full = { id: uuid(), expiresOn: null, revokedOn: null, revocationReason: null, ...a };
  record.authorizations.push(full);
  return full;
}

export function revokeAuthorization(record, id, date, reason) {
  const a = record.authorizations.find((x) => x.id === id);
  if (a) { a.revokedOn = iso(date); a.revocationReason = reason; }
}

export function recordPhaseChange(record, p, now) {
  validateAttestation(record, p.attestation, now);
  record.phaseChanges.push({ id: uuid(), ...p });
}

export function recordClinicalReview(record, r, now) {
  validateAttestation(record, r.attestation, now);
  record.reviews.push({ id: uuid(), ...r });
  for (const h of record.holds)
    if (!h.releasedAt && ms(h.startedAt) <= ms(r.attestation.assessmentDate)) {
      h.releasedAt = r.attestation.assessmentDate;
      h.releaseReason = `Clinical review by ${r.attestation.clinicianName}`;
    }
}

export function recordFunctionalAssessment(record, f) {
  if (blank(f.assessedBy)) throw new ClinicalError('missingFields', 'Missing required fields: assessed by.');
  if (!(f.test in TESTS)) throw new ClinicalError('range', 'Unknown test.');
  record.functionalAssessments.push({ id: uuid(), assessorRole: 'patientSelfAssessed', result: '', ...f, date: iso(f.date) });
}

export function recordCompletion(record, c) {
  if (blank(c.documentedBy)) throw new ClinicalError('missingFields', 'Missing required fields: documented by.');
  record.completions.push({ id: uuid(), note: '', ...c, completedOn: iso(c.completedOn) });
}

// ───────────────────────── Access engine ─────────────────────────
// Inputs: authorizations, functional tests, completions, check-ins, holds, activity log.
// NOT inputs: calendar week, Apple Health data (record.health is never read here).

export const REASON_TEXT = {
  noClinicalAuthorization: () => 'No documented clinician authorization',
  authorizationExpiredOrRevoked: () => 'Clinician authorization expired or was revoked',
  noExercisesListedByClinician: () => 'Clinician did not list specific exercises',
  missingPrerequisite: (r) => `Prerequisite not documented as complete: ${catName(r.category)}`,
  missingFunctionalAssessment: (r) => `Functional assessment not passed: ${TESTS[r.test]}`,
  clinicianAssessmentRequired: (r) => `Must be assessed by a clinician: ${TESTS[r.test]}`,
  noRecentSymptomCheckIn: () => 'No symptom check-in in the last 72 hours',
  progressionHold: () => 'Progression on hold because symptoms worsened',
  urgentSymptoms: () => 'Urgent symptoms reported — stop and seek medical assessment',
};
export const describeReason = (r) => REASON_TEXT[r.code](r);

const authActive = (a, t) => ms(a.effectiveFrom) <= t && (!a.expiresOn || t <= ms(a.expiresOn)) && (!a.revokedOn || t < ms(a.revokedOn));

/** The evidence the engine may read. Health data is intentionally absent. */
export function clinicalEvidence(record) {
  const { profile, authorizations, functionalAssessments, completions, checkIns, holds, activityLog, rules } = record;
  return { profile, authorizations, functionalAssessments, completions, checkIns, holds, activityLog, rules };
}

export function activeHold(e, date) {
  const t = ms(date);
  return e.holds.filter((h) => ms(h.startedAt) <= t && (!h.releasedAt || ms(h.releasedAt) > t))
    .sort((a, b) => LEVEL[b.level] - LEVEL[a.level])[0] ?? null;
}

export function accessFor(e, cat, date) {
  const t = ms(date), hold = activeHold(e, date), c = CAT[cat];
  if (c.baseline === 'documentOnly') return { kind: 'documentOnly' };
  if (c.baseline === 'permitted')
    return { kind: 'available', caution: hold ? HOLD_CAUTION : null,
      exercises: libraryFor(cat).map((x) => ({ name: x.name, parameters: 'Within comfort; stop if limping or pain rises' })) };

  const reasons = [];
  const forCat = e.authorizations.filter((a) => a.category === cat);
  const active = forCat.filter((a) => authActive(a, t));
  const seen = new Map();
  for (const a of active) for (const x of a.approvedExercises) seen.set(`${x.name}|${x.parameters}`, x);
  const exercises = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (!active.length) reasons.push({ code: forCat.some((a) => ms(a.effectiveFrom) <= t) ? 'authorizationExpiredOrRevoked' : 'noClinicalAuthorization' });
  else if (!exercises.length) reasons.push({ code: 'noExercisesListedByClinician' });

  const rule = e.rules.rules[cat] ?? { prerequisites: [], requiredAssessments: [] };
  for (const p of rule.prerequisites)
    if (!e.completions.some((x) => x.category === p && ms(x.completedOn) <= t)) reasons.push({ code: 'missingPrerequisite', category: p });
  const clinicianOnly = e.rules.clinicianAssessmentRequiredFor.includes(cat);
  for (const test of rule.requiredAssessments) {
    const latest = latestBy(e.functionalAssessments.filter((f) => f.test === test && (!clinicianOnly || f.assessorRole === 'clinician')), 'date', t);
    if (latest?.passed !== true) reasons.push({ code: clinicianOnly ? 'clinicianAssessmentRequired' : 'missingFunctionalAssessment', test });
  }

  const lastCheckIn = latestBy(e.checkIns, 'date', t);
  if (!lastCheckIn || t - ms(lastCheckIn.date) > e.rules.symptomRecencyHours * 3600e3) reasons.push({ code: 'noRecentSymptomCheckIn' });

  let caution = null;
  if (hold) {
    if (hold.level === 'urgent') reasons.push({ code: 'urgentSymptoms' });
    else if (e.activityLog.some((x) => x.category === cat && ms(x.date) < ms(hold.startedAt))) caution = HOLD_CAUTION;
    else reasons.push({ code: 'progressionHold' });
  }
  return reasons.length ? { kind: 'locked', reasons } : { kind: 'available', exercises, caution };
}

export const access = (record, cat, date) => accessFor(clinicalEvidence(record), cat, date);
export const progressionPaused = (record, date) => activeHold(clinicalEvidence(record), date) !== null;

export function logActivity(record, entry) {
  const a = access(record, entry.category, entry.date);
  if (a.kind === 'locked')
    throw new ClinicalError('categoryLocked', `${catName(entry.category)} is locked: ${a.reasons.map(describeReason).join('; ')}.`, a.reasons);
  if (a.kind === 'available' && CAT[entry.category].baseline === 'restricted' && !a.exercises.some((x) => x.name === entry.exerciseName))
    throw new ClinicalError('exerciseNotApproved', `${entry.exerciseName} is not on a current clinician approval.`);
  if (blank(entry.exerciseName)) throw new ClinicalError('missingFields', 'Missing required fields: exercise.');
  record.activityLog.push({ id: uuid(), notes: '', source: 'manual', ...entry, date: iso(entry.date) });
}

// ───────────────────────── Phases, weeks, plan ─────────────────────────

export const PHASES = { protection: 'Protection', earlyLoading: 'Early loading', strengthening: 'Strengthening',
  returnToActivity: 'Return to activity', returnToSport: 'Return to sport' };

export function phaseAt(record, date) {
  return latestBy(record.phaseChanges, 'effectiveDate', ms(date))?.phase ?? 'protection';
}

const localDay = (d) => { const x = new Date(ms(d)); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()); };
export const daysBetween = (a, b) => Math.round((localDay(b) - localDay(a)) / 864e5);
export const calendarWeek = (record, date) => Math.max(1, Math.floor(daysBetween(record.plan.startDate, date) / 7) + 1);
export const plannedWeeks = (record) => record.plan.provisionalWeeks + record.plan.extensions.reduce((s, x) => s + x.addedWeeks, 0);
export const displayedWeeks = (record, date) => Math.max(plannedWeeks(record), calendarWeek(record, date));
export const extendPlan = (record, weeks, reason, date) => record.plan.extensions.push({ addedWeeks: weeks, reason, date: iso(date) });

export function weekRange(record, w) {
  const s = new Date(ms(record.plan.startDate));
  return [new Date(s.getFullYear(), s.getMonth(), s.getDate() + (w - 1) * 7), new Date(s.getFullYear(), s.getMonth(), s.getDate() + w * 7)];
}

export function statusLabel(record, date) {
  const p = PHASES[phaseAt(record, date)].toUpperCase();
  return record.profile.orthopedicStatus === 'awaitingAssessment' ? `${p} — AWAITING CLINICAL ASSESSMENT` : `${p} — CLINICIAN-DIRECTED`;
}

const fmtDate = (d, time = false) => new Date(ms(d)).toLocaleString(undefined,
  time ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
export const needsFindings = (a, now) => !!a.scheduledAt && ms(a.scheduledAt) < ms(now) && !a.findingsRecordedAt;

export function pendingMilestones(record, date) {
  const m = [], t = ms(date);
  if (record.profile.orthopedicStatus === 'awaitingAssessment') {
    const booked = record.appointments.filter((a) => a.kind === 'orthopedic' && a.scheduledAt && ms(a.scheduledAt) > t)
      .map((a) => a.scheduledAt).sort()[0];
    m.push(booked ? `Orthopedic assessment — booked ${fmtDate(booked, true)}` : 'Orthopedic assessment — not yet booked');
  }
  for (const a of record.appointments) if (needsFindings(a, date)) m.push(`Enter specialist findings: ${a.title}`);
  for (const a of record.orthopedicAssessments)
    if (!record.restrictionsReviewed[a.id]) m.push(`Review written restrictions from ${a.attestation.clinicianName}`);
  if (record.profile.physiotherapyStatus === 'referred') m.push('Start physiotherapy');
  if (record.profile.treatmentPathway === 'notYetConfirmed') m.push('Treatment pathway confirmed by specialist');
  const h = activeHold(clinicalEvidence(record), date);
  if (h) m.push(h.level === 'urgent' ? 'Urgent medical assessment of symptoms' : 'Clinical review of worsening symptoms');
  for (const a of record.appointments) {
    if (!a.scheduledAt || ms(a.scheduledAt) <= t) continue;
    if (a.kind === 'orthopedic' && record.profile.orthopedicStatus === 'awaitingAssessment') continue;
    m.push(`${a.title} — ${fmtDate(a.scheduledAt)}`);
  }
  return m;
}

export function latestEvaluation(record, date) {
  const last = latestBy(record.checkIns, 'date', ms(date));
  return last ? evaluate(last, record.checkIns, record.profile) : null;
}

export function dashboard(record, date) {
  const available = {}, restricted = {};
  for (const c of RESTRICTED) {
    const a = access(record, c, date);
    if (a.kind === 'available') available[c] = a; else restricted[c] = a.reasons;
  }
  const d = new Date(ms(date));
  return {
    statusLabel: statusLabel(record, date),
    calendarWeek: calendarWeek(record, date),
    daysSinceInjury: daysBetween(record.profile.injuryDate, date),
    phase: phaseAt(record, date),
    evaluation: latestEvaluation(record, date),
    checkInDueToday: !record.checkIns.some((c) => localDay(c.date) === localDay(d)),
    progressionPaused: progressionPaused(record, date),
    permittedLogging: CATEGORIES.filter((c) => c.baseline === 'permitted').map((c) => c.key),
    documentOnly: CATEGORIES.filter((c) => c.baseline === 'documentOnly').map((c) => c.key),
    available, restricted,
    pendingMilestones: pendingMilestones(record, date),
    appointmentsNeedingFindings: record.appointments.filter((a) => needsFindings(a, date)),
  };
}

export function weeklySummaries(record, now) {
  const current = calendarWeek(record, now), out = [];
  for (let w = 1; w <= displayedWeeks(record, now); w++) {
    const [s, e] = weekRange(record, w), inRange = (d) => ms(d) >= s.getTime() && ms(d) < e.getTime();
    const status = w < current ? 'past' : w === current ? 'current' : 'future';
    const asOf = status === 'past' ? new Date(e.getTime() - 1) : now;
    const phases = [];
    if (status !== 'future') {
      phases.push(phaseAt(record, s));
      for (const p of [...record.phaseChanges].sort((a, b) => ms(a.effectiveDate) - ms(b.effectiveDate)))
        if (inRange(p.effectiveDate) && phases.at(-1) !== p.phase) phases.push(p.phase);
    }
    const approved = record.authorizations.filter((a) => authActive(a, ms(asOf)))
      .flatMap((a) => a.approvedExercises.map((x) => `${catName(a.category)}: ${x.name} — ${x.parameters}`));
    const events = [];
    for (const a of record.orthopedicAssessments) if (inRange(a.attestation.assessmentDate)) events.push(`Orthopedic assessment — ${a.attestation.clinicianName}`);
    for (const p of record.phaseChanges) if (inRange(p.effectiveDate)) events.push(`Phase set to ${PHASES[p.phase]} by ${p.attestation.clinicianName}`);
    for (const h of record.holds) {
      if (inRange(h.startedAt)) events.push('Progression hold started');
      if (h.releasedAt && inRange(h.releasedAt)) events.push(`Hold released: ${h.releaseReason}`);
    }
    for (const a of record.appointments) if (a.scheduledAt && inRange(a.scheduledAt)) events.push(a.title);
    out.push({
      calendarWeek: w, start: s.toISOString(), end: e.toISOString(), status,
      isProvisional: status === 'future', isExtension: w > record.plan.provisionalWeeks,
      clinicalPhases: phases,
      approvedExercises: status === 'future' ? [] : approved,
      completedActivities: record.activityLog.filter((x) => inRange(x.date)).sort((a, b) => ms(a.date) - ms(b.date)),
      restrictedActivities: status === 'future' ? [...RESTRICTED] : RESTRICTED.filter((c) => access(record, c, asOf).kind !== 'available'),
      pendingMilestones: status === 'current' ? pendingMilestones(record, now) : [],
      clinicalEvents: events,
    });
  }
  return out;
}

// ───────────────────────── Reminders (.ics, since iOS web apps can't schedule local alerts) ─────────────────────────

export function reminders(appointments, now) {
  const out = [];
  for (const a of appointments) {
    if (!a.scheduledAt) continue;
    const s = ms(a.scheduledAt);
    for (const h of a.reminderOffsetsHours) {
      const f = s - h * 3600e3;
      if (f > ms(now)) out.push({ id: `${a.id}-pre-${h}`, fireDate: iso(f), title: a.title, body: `In ${h} hours. Bring your question checklist and MRI report.` });
    }
    const post = s + 2 * 3600e3;
    if (post > ms(now) && !a.findingsRecordedAt)
      out.push({ id: `${a.id}-findings`, fireDate: iso(post), title: 'Record specialist findings', body: `Enter the findings and written restrictions from ${a.title}.` });
  }
  return out.sort((a, b) => ms(a.fireDate) - ms(b.fireDate));
}

const icsDate = (d) => iso(d).replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Calendar file: appointments with alarms, a findings prompt after each, and a daily check-in. */
export function buildICS(record, now, checkInHour = 20) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rectus Recovery//EN', 'CALSCALE:GREGORIAN'];
  const stamp = icsDate(now);
  for (const a of record.appointments) {
    if (!a.scheduledAt || ms(a.scheduledAt) < ms(now)) continue;
    const s = ms(a.scheduledAt);
    const desc = ['Bring: MRI report, question checklist. Ask for restrictions in writing.', '',
      ...a.questions.map((q, i) => `${i + 1}. ${q.question}`)].join('\n');
    L.push('BEGIN:VEVENT', `UID:${a.id}@rectus-recovery`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(s)}`, `DTEND:${icsDate(s + 3600e3)}`,
      `SUMMARY:${icsText(a.title)}`, `DESCRIPTION:${icsText(desc)}`);
    for (const h of a.reminderOffsetsHours)
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(a.title)}`, `TRIGGER:-PT${h}H`, 'END:VALARM');
    L.push('END:VEVENT');
    if (!a.findingsRecordedAt)
      L.push('BEGIN:VEVENT', `UID:${a.id}-findings@rectus-recovery`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(s + 2 * 3600e3)}`,
        `DTEND:${icsDate(s + 2.25 * 3600e3)}`, 'SUMMARY:Record specialist findings in Rectus Recovery',
        `DESCRIPTION:${icsText('Upload the clinic letter, then enter the findings. Restricted activities stay locked until you do.')}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Record specialist findings', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  const t = new Date(ms(now)); t.setHours(checkInHour, 0, 0, 0);
  const local = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}T${String(checkInHour).padStart(2, '0')}0000`;
  L.push('BEGIN:VEVENT', 'UID:daily-check-in@rectus-recovery', `DTSTAMP:${stamp}`, `DTSTART:${local}`, 'DURATION:PT5M', 'RRULE:FREQ=DAILY',
    'SUMMARY:Rectus Recovery — daily symptom check-in',
    `DESCRIPTION:${icsText('Two minutes: pain, limp, swelling, and how the leg felt after yesterday.')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Daily check-in', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

// ───────────────────────── Apple Health (manual export.xml) ─────────────────────────
// Performance data only. Never read by the access engine; never creates authorizations,
// completions, assessments, phase changes, or activity-log entries.

export const HEALTH_METRICS = {
  steps: ['HKQuantityTypeIdentifierStepCount', 'Steps', 'sum'],
  walkingRunningDistance: ['HKQuantityTypeIdentifierDistanceWalkingRunning', 'Walking + running distance', 'sum'],
  cyclingDistance: ['HKQuantityTypeIdentifierDistanceCycling', 'Cycling distance', 'sum'],
  heartRate: ['HKQuantityTypeIdentifierHeartRate', 'Heart rate', 'stats'],
  restingHeartRate: ['HKQuantityTypeIdentifierRestingHeartRate', 'Resting heart rate', 'stats'],
  sleep: ['HKCategoryTypeIdentifierSleepAnalysis', 'Sleep (minutes asleep)', 'sum'],
};
const TYPE_TO_METRIC = Object.fromEntries(Object.entries(HEALTH_METRICS).map(([k, [t]]) => [t, k]));
const ASLEEP = /HKCategoryValueSleepAnalysisAsleep/;

export function emptyHealth() {
  return { importedAt: null, exportDate: null, daily: {}, workouts: [] };
}

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };
// "2026-11-12 08:00:00 +0100" → "2026-11-12T08:00:00+01:00"
export const parseHKDate = (s) => s ? s.replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d)(\d\d)$/, '$1T$2$3:$4') : null;
const toMetres = (v, unit) => ({ m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 }[unit] ?? 1) * v;
const toSeconds = (v, unit) => ({ s: 1, sec: 1, min: 60, hr: 3600, h: 3600 }[unit] ?? 60) * v;

/**
 * Streaming parser for Apple Health export.xml. Feed text chunks with push(); call finish().
 * Daily totals are kept per source and the largest source wins (ASSUMPTION: avoids double-counting
 * iPhone + Watch; may undercount if devices split a day). Missing days are absent, never zero.
 */
export function createHealthParser({ since } = {}) {
  const sinceDay = since ? new Date(ms(since)).toISOString().slice(0, 10) : '0000';
  const daily = {}; // key metric|day → { bySource: {src: {sum, n, min, max}} }
  const workouts = [];
  let carry = '', exportDate = null, records = 0;

  const add = (metric, day, src, v) => {
    const k = `${metric}|${day}`, d = (daily[k] ??= { metric, day, bySource: {} });
    const s = (d.bySource[src] ??= { sum: 0, n: 0, min: Infinity, max: -Infinity });
    s.sum += v; s.n++; s.min = Math.min(s.min, v); s.max = Math.max(s.max, v);
  };

  function handleRecord(tag) {
    const metric = TYPE_TO_METRIC[attr(tag, 'type')];
    if (!metric) return;
    const start = attr(tag, 'startDate'), end = attr(tag, 'endDate'), src = attr(tag, 'sourceName') ?? '?';
    if (!start || start.slice(0, 10) < sinceDay) return;
    records++;
    if (metric === 'sleep') {
      if (!ASLEEP.test(attr(tag, 'value') ?? '')) return;
      const mins = (ms(parseHKDate(end)) - ms(parseHKDate(start))) / 60000;
      if (mins > 0) add('sleep', end.slice(0, 10), src, mins);
      return;
    }
    let v = Number(attr(tag, 'value'));
    if (!Number.isFinite(v)) return;
    if (metric.endsWith('Distance')) v = toMetres(v, attr(tag, 'unit'));
    add(metric, start.slice(0, 10), src, v);
  }

  function handleWorkout(block) {
    const open = block.match(/<Workout\b[^>]*>/)[0];
    const start = attr(open, 'startDate'), end = attr(open, 'endDate');
    if (!start || start.slice(0, 10) < sinceDay) return;
    let distance = null;
    const td = attr(open, 'totalDistance');
    if (td) distance = toMetres(Number(td), attr(open, 'totalDistanceUnit'));
    for (const st of block.match(/<WorkoutStatistics\b[^>]*>/g) ?? []) {
      const ty = attr(st, 'type') ?? '';
      if (/Distance(Cycling|WalkingRunning|Swimming)/.test(ty) && attr(st, 'sum')) distance = toMetres(Number(attr(st, 'sum')), attr(st, 'unit'));
    }
    const dur = attr(open, 'duration');
    workouts.push({
      id: `${attr(open, 'workoutActivityType')}|${start}|${attr(open, 'sourceName')}`,
      type: (attr(open, 'workoutActivityType') ?? 'Other').replace('HKWorkoutActivityType', ''),
      start: parseHKDate(start), end: parseHKDate(end),
      durationSeconds: dur ? toSeconds(Number(dur), attr(open, 'durationUnit')) : (ms(parseHKDate(end)) - ms(parseHKDate(start))) / 1000,
      distanceMetres: distance, source: attr(open, 'sourceName') ?? '?',
    });
  }

  function process(text) {
    const ed = text.match(/<ExportDate\b[^>]*value="([^"]*)"/);
    if (ed) exportDate = parseHKDate(ed[1]);
    for (const m of text.matchAll(/<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g)) handleWorkout(m[0]);
    const noWorkouts = text.replace(/<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g, '');
    for (const m of noWorkouts.matchAll(/<Record\b[^>]*>/g)) handleRecord(m[0]);
  }

  return {
    push(chunk) {
      const buf = carry + chunk;
      let cut = buf.lastIndexOf('<');
      const wOpen = buf.lastIndexOf('<Workout '), wClose = buf.lastIndexOf('</Workout>');
      if (wOpen > wClose) {
        const tagEnd = buf.indexOf('>', wOpen);
        if (tagEnd === -1 || buf[tagEnd - 1] !== '/') cut = Math.min(cut, wOpen);
      }
      if (cut < 0) cut = buf.length;
      process(buf.slice(0, cut));
      carry = buf.slice(cut);
    },
    finish() {
      process(carry);
      carry = '';
      const out = {};
      for (const [k, d] of Object.entries(daily)) {
        const srcs = Object.values(d.bySource);
        const [, , mode] = HEALTH_METRICS[d.metric];
        if (mode === 'sum') {
          const best = srcs.reduce((a, b) => (b.sum > a.sum ? b : a));
          out[k] = { metric: d.metric, day: d.day, value: best.sum, sources: Object.keys(d.bySource) };
        } else {
          const n = srcs.reduce((a, s) => a + s.n, 0);
          out[k] = { metric: d.metric, day: d.day, value: srcs.reduce((a, s) => a + s.sum, 0) / n,
            min: Math.min(...srcs.map((s) => s.min)), max: Math.max(...srcs.map((s) => s.max)), sources: Object.keys(d.bySource) };
        }
      }
      return { exportDate, records, daily: out, workouts: dedupeWorkouts(workouts) };
    },
  };
}

/** Same workout from two apps (e.g., Watch + Strava): same type, ≥80% time overlap → keep the first. */
export function dedupeWorkouts(ws) {
  const kept = [];
  for (const w of [...ws].sort((a, b) => ms(a.start) - ms(b.start))) {
    const dup = kept.some((o) => {
      if (o.id === w.id) return true;
      if (o.type !== w.type) return false;
      const overlap = Math.min(ms(o.end), ms(w.end)) - Math.max(ms(o.start), ms(w.start));
      const shorter = Math.min(ms(o.end) - ms(o.start), ms(w.end) - ms(w.start));
      return shorter > 0 && overlap / shorter >= 0.8;
    });
    if (!dup) kept.push(w);
  }
  return kept;
}

/** A full Apple Health export is authoritative: replace, so deletions and duplicates resolve. */
export function replaceHealthData(record, parsed, now) {
  record.health = { importedAt: iso(now), exportDate: parsed.exportDate, daily: parsed.daily, workouts: parsed.workouts };
  return { days: new Set(Object.values(parsed.daily).map((d) => d.day)).size, workouts: parsed.workouts.length };
}

/** undefined means "no data" — never treated as zero activity. */
export const dailyValue = (record, metric, day) => record.health.daily[`${metric}|${day}`];

// ───────────────────────── Backup ─────────────────────────

export function migrate(record) {
  const base = initialRecord();
  for (const k of Object.keys(base)) if (record[k] === undefined) record[k] = base[k];
  record.rules = { ...defaultRules(), ...record.rules };
  return record;
}
