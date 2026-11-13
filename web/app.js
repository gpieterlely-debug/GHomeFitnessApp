import * as C from './core.js';
import * as S from './store.js';

// ───────────────────────── Basics ─────────────────────────

const params = new URLSearchParams(location.search);
const now = () => (params.get('now') ? new Date(params.get('now')) : new Date()); // ?now= for testing only
const app = document.getElementById('app');
let record;
let flash = null; // { kind: 'ok'|'error'|'urgent'|'warn', html }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (d) => new Date(d).getTime();
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const dateInput = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const dtInput = (d) => { const x = new Date(d); return `${dateInput(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
const fromDateInput = (v) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 12); };
// For "when did this happen" dates: noon of that day, but never later than now (a same-day morning entry is not in the future).
const pastDateInput = (v) => new Date(Math.min(fromDateInput(v).getTime(), now().getTime()));
const label = (s) => String(s).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

async function commit(fn) {
  const copy = structuredClone(record);
  const out = fn(copy);
  await S.saveRecord(copy);
  record = copy;
  return out;
}

function fail(e) {
  flash = { kind: 'error', html: esc(e?.message ?? String(e)) };
  render();
  window.scrollTo(0, 0);
}

function go(hash, msg) {
  if (msg) flash = msg;
  if (location.hash === hash) render(); else location.hash = hash;
  window.scrollTo(0, 0);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  download(blob, name);
}

// ───────────────────────── Shared fragments ─────────────────────────

const card = (title, body, cls = '') => `<section class="card ${cls}">${title ? `<h2>${title}</h2>` : ''}${body}</section>`;
const list = (items, empty = 'None') => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`);

function evaluationBanner(ev) {
  if (!ev || ev.level === 'stable') return '';
  return `<div class="banner ${ev.level}" role="alert"><strong>${ev.level === 'urgent' ? 'Urgent' : 'Hold progression'}</strong>
    <p>${esc(C.evaluationMessage(ev))}</p>${list(ev.reasons.map(esc))}</div>`;
}

function flashHtml() {
  if (!flash) return '';
  const h = `<div class="banner ${flash.kind}" role="status">${flash.html}</div>`;
  flash = null;
  return h;
}

const footer = `<p class="safety">This app records what your clinicians decide. It does not diagnose, clear, or prescribe.
  Pain scores and fitness data do not show tendon healing.</p>`;

function attestationFields(prefix = '') {
  const docs = record.documents;
  return `<fieldset><legend>Who decided (required)</legend>
    <label>Clinician name<input name="${prefix}clinicianName" required autocomplete="off"></label>
    <label>Role<input name="${prefix}role" value="Orthopedic surgeon"></label>
    <label>Date of decision<input type="date" name="${prefix}assessmentDate" required value="${dateInput(now())}" max="${dateInput(now())}"></label>
    <label>Source document
      <select name="${prefix}sourceDocumentID" required>
        <option value="">Choose the uploaded letter or report</option>
        ${docs.map((d) => `<option value="${d.id}">${esc(d.title)} (${fmtDate(d.documentDate)})</option>`).join('')}
      </select></label>
    ${docs.length ? '' : '<p class="error-text">Upload the clinic letter or written restrictions first (Clinical → Documents).</p>'}
    <label>Instructions, as written<textarea name="${prefix}instructions" rows="3" required></textarea></label>
  </fieldset>`;
}

const readAttestation = (fd, prefix = '') => ({
  clinicianName: fd.get(`${prefix}clinicianName`)?.trim(),
  role: fd.get(`${prefix}role`) ?? '',
  assessmentDate: pastDateInput(fd.get(`${prefix}assessmentDate`)).toISOString(),
  instructions: fd.get(`${prefix}instructions`) ?? '',
  sourceDocumentID: fd.get(`${prefix}sourceDocumentID`),
});

/** "Exercise — dose" per line. Both parts required, exactly as the clinician wrote them. */
function parseExercises(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.+?)\s+(?:—|–|-|:)\s+(.+)$/);
    if (!m) throw new Error(`Write each exercise as "Exercise — dose". Missing dose in: "${l}"`);
    return { name: m[1].trim(), parameters: m[2].trim() };
  });
}

const segmented = (name, options, labeler = (x) => x) =>
  `<div class="seg">${options.map((o) => `<label><input type="radio" name="${name}" value="${o}" required><span>${esc(labeler(o))}</span></label>`).join('')}</div>`;

// ───────────────────────── Today ─────────────────────────

function viewToday() {
  const t = now(), d = C.dashboard(record, t);
  const daysSinceBackup = record.meta?.lastBackupAt ? C.daysBetween(record.meta.lastBackupAt, t) : null;
  const warn = [];
  if (!isStandalone()) warn.push('<strong>Add to Home Screen</strong> (Share → Add to Home Screen). Otherwise Safari can delete your data after 7 days without use.');
  if (daysSinceBackup === null || daysSinceBackup >= 7)
    warn.push(`<a href="#/data">Back up your data</a> — ${daysSinceBackup === null ? 'no backup yet' : `last backup ${daysSinceBackup} days ago`}.`);

  const logBtn = (c, note = '') => `<a class="btn" href="#/log/${c}">${esc(C.catName(c))}${note}</a>`;
  return `
    <header class="status"><h1>${esc(d.statusLabel)}</h1>
      <p>Week ${d.calendarWeek} since injury · day ${d.daysSinceInjury} · phase set by clinician: ${C.PHASES[d.phase]}</p></header>
    ${evaluationBanner(d.evaluation)}
    ${warn.length ? `<div class="banner warn">${warn.map((w) => `<p>${w}</p>`).join('')}</div>` : ''}
    ${d.checkInDueToday ? '<a class="btn primary big" href="#/checkin">Daily symptom check-in is due</a>' : ''}
    ${d.appointmentsNeedingFindings.map((a) => `<a class="btn primary big" href="#/assessment">Enter findings from ${esc(a.title)}</a>`).join('')}
    ${card('Pending milestones', list(d.pendingMilestones.map(esc)))}
    ${card('You may log', `<div class="btns">${d.permittedLogging.map((c) => logBtn(c)).join('')}
      ${Object.keys(d.available).map((c) => logBtn(c, ' <small>clinician-approved</small>')).join('')}</div>`)}
    ${card('Document only', `<div class="btns">${d.documentOnly.map((c) => logBtn(c)).join('')}</div>
      <p class="muted">Recorded as activity. Not prescribed or medically cleared by this app.</p>`)}
    ${card('Restricted until documented clinician authorization',
      Object.entries(d.restricted).map(([c, rs]) => `<details><summary>🔒 ${esc(C.catName(c))}</summary>${list(rs.map((r) => esc(C.describeReason(r))))}</details>`).join('') || '<p class="muted">None</p>')}
    ${footer}`;
}

// ───────────────────────── Activity log ─────────────────────────

function viewLog(cat) {
  if (!C.CAT[cat]) return '<p>Unknown activity.</p>';
  const a = C.access(record, cat, now());
  let body;
  if (a.kind === 'locked') {
    body = `<p>Locked:</p>${list(a.reasons.map((r) => esc(C.describeReason(r))))}<a class="btn" href="#/today">Back</a>`;
  } else {
    const pick = a.kind === 'documentOnly'
      ? `<label>What you did<input name="exerciseName" required placeholder="e.g. Seated dumbbell press"></label>
         <p class="muted">Documented only. Ask your clinician which upper-body positions are safe — kettlebell swings, cleans and deadlifts load the hip.</p>`
      : `<label>Exercise<select name="exerciseName" required><option value="">Choose</option>
          ${a.exercises.map((x) => `<option value="${esc(x.name)}">${esc(x.name)} — ${esc(x.parameters)}</option>`).join('')}</select></label>
         ${a.exercises.map((x) => { const lib = C.LIBRARY.find((l) => l.name === x.name); return lib ? `<p class="muted"><strong>${esc(x.name)}:</strong> ${esc(lib.demonstration)}</p>` : ''; }).join('')}`;
    body = `${a.caution ? `<div class="banner worsening">${esc(a.caution)}</div>` : ''}
      <form data-form="log" data-cat="${cat}">${pick}
        <label>Duration (minutes)<input type="number" name="durationMinutes" min="1" max="600" value="15" required inputmode="numeric"></label>
        <label>Notes<textarea name="notes" rows="2"></textarea></label>
        <button class="btn primary">Save</button></form>`;
  }
  return card(esc(C.catName(cat)), body);
}

// ───────────────────────── Check-in ─────────────────────────

function viewCheckIn() {
  const pain = Array.from({ length: 11 }, (_, i) => i);
  return `<h1>Daily check-in</h1>
  <form data-form="checkin" class="card">
    <fieldset><legend>Resting pain (0 none – 10 worst)</legend>${segmented('restingPain', pain)}</fieldset>
    <fieldset><legend>Walking pain</legend>${segmented('walkingPain', pain)}</fieldset>
    <fieldset><legend>Limp</legend>${segmented('limp', C.LIMP, (x) => ({ unableToBearWeight: "Can't bear weight" }[x] ?? label(x)))}</fieldset>
    <fieldset><legend>Swelling</legend>${segmented('swelling', C.SEVERITY, label)}</fieldset>
    <fieldset><legend>Stiffness</legend>${segmented('stiffness', C.SEVERITY, label)}</fieldset>
    <fieldset><legend>New weakness</legend>${segmented('newWeakness', ['false', 'true'], (x) => (x === 'true' ? 'Yes' : 'No'))}</fieldset>
    <label>Activity today (minutes)<input type="number" name="activityDurationMinutes" min="0" max="600" required inputmode="numeric"></label>
    <fieldset><legend>How was the leg the day after yesterday's activity?</legend>
      ${segmented('nextDayResponse', C.NEXT_DAY, (x) => ({ noActivityYesterday: 'No activity' }[x] ?? label(x)))}</fieldset>
    <fieldset class="flags"><legend>Any of these? (urgent)</legend>
      ${Object.entries(C.RED_FLAGS).map(([k, v]) => `<label class="check"><input type="checkbox" name="redFlags" value="${k}"> ${esc(v)}</label>`).join('')}</fieldset>
    <label>Notes<textarea name="notes" rows="2"></textarea></label>
    <button class="btn primary big">Save check-in</button>
  </form>${footer}`;
}

// ───────────────────────── Plan ─────────────────────────

function viewPlan() {
  const weeks = C.weeklySummaries(record, now()).reverse();
  const row = (title, items) => `<div class="col"><h4>${title}</h4>${list(items.map(esc), '—')}</div>`;
  return `<h1>Recovery plan</h1>
    <p class="muted">Provisional ${record.plan.provisionalWeeks} weeks from ${fmtDate(record.plan.startDate)}. Week numbers never unlock anything.</p>
    <form data-form="extend" class="inline"><button class="btn">Extend plan by 4 weeks</button></form>
    ${weeks.map((w) => `<details class="week ${w.status}" ${w.status === 'current' ? 'open' : ''}>
      <summary><strong>Week ${w.calendarWeek}</strong> <span class="muted">${fmtDate(w.start)}</span>
        ${w.status === 'current' ? '<span class="tag">now</span>' : ''}${w.isProvisional ? '<span class="tag">provisional</span>' : ''}${w.isExtension ? '<span class="tag">extended</span>' : ''}</summary>
      ${row('Clinical phase', w.clinicalPhases.length ? w.clinicalPhases.map((p) => C.PHASES[p]) : ['Not set — clinician decides'])}
      ${row('Clinician-approved', w.approvedExercises.length ? w.approvedExercises : ['None documented'])}
      ${row('Completed', w.completedActivities.map((a) => `${a.exerciseName} · ${a.durationMinutes} min${C.CAT[a.category].baseline === 'documentOnly' ? ' (documented only)' : ''}`))}
      ${row('Restricted', w.restrictedActivities.map(C.catName))}
      ${w.pendingMilestones.length ? row('Pending milestones', w.pendingMilestones) : ''}
      ${w.clinicalEvents.length ? row('Clinical events', w.clinicalEvents) : ''}
    </details>`).join('')}`;
}

// ───────────────────────── Clinical ─────────────────────────

function viewClinical() {
  const p = record.profile;
  const auths = record.authorizations.map((a) => `<li><strong>${esc(C.catName(a.category))}</strong>
      ${list(a.approvedExercises.map((x) => `${esc(x.name)} — ${esc(x.parameters)}`))}
      <small class="muted">By ${esc(a.attestation.clinicianName)}, ${fmtDate(a.attestation.assessmentDate)}${a.expiresOn ? ` · expires ${fmtDate(a.expiresOn)}` : ''}</small>
      ${a.revokedOn ? `<span class="tag">revoked ${fmtDate(a.revokedOn)}</span>` : `<button class="link" data-action="revoke" data-id="${a.id}">Revoke</button>`}</li>`).join('');
  return `<h1>Clinical</h1>
  ${card('Profile', `<p>${esc(p.diagnosis)}</p><p class="muted">${esc(p.imagingSummary)}</p>
    <dl><dt>Injury date</dt><dd>${fmtDate(p.injuryDate)}</dd><dt>Orthopedics</dt><dd>${label(p.orthopedicStatus)}</dd>
    <dt>Physiotherapy</dt><dd>${label(p.physiotherapyStatus)}</dd><dt>Treatment pathway</dt><dd>${label(p.treatmentPathway)}</dd>
    <dt>Goals</dt><dd>${p.goals.map(esc).join(', ')}</dd><dt>Kettlebells</dt><dd>${p.availableKettlebellsKg.join(', ')} kg</dd></dl>`)}
  ${card('Appointments', `${list(record.appointments.map((a) => `<a href="#/appointment/${a.id}">${esc(a.title)}</a> — ${a.scheduledAt ? fmtDateTime(a.scheduledAt) : 'not booked'}${C.needsFindings(a, now()) ? ' <span class="tag">findings needed</span>' : ''}`))}
    <form data-form="addAppointment" class="inline"><select name="kind">${['orthopedic', 'physiotherapy', 'imaging', 'generalPractice', 'other'].map((k) => `<option value="${k}">${label(k)}</option>`).join('')}</select>
    <button class="btn">Add appointment</button></form>
    <button class="btn" data-action="ics">Add reminders to Calendar</button>`)}
  ${card('Documents (MRI reports, letters)', `${list(record.documents.map((d) => `<button class="link" data-action="openDoc" data-id="${d.id}">${esc(d.title)}</button> · ${label(d.kind)} · ${fmtDate(d.documentDate)}`))}
    <form data-form="upload">
      <label>File (photo or PDF)<input type="file" name="file" accept="image/*,application/pdf" required></label>
      <label>Type<select name="kind">${['mriReport', 'clinicLetter', 'writtenRestrictions', 'physiotherapyPlan', 'other'].map((k) => `<option value="${k}">${label(k)}</option>`).join('')}</select></label>
      <label>Title<input name="title" required placeholder="e.g. Ortho letter 19 Nov"></label>
      <label>Document date<input type="date" name="documentDate" required value="${dateInput(now())}"></label>
      <button class="btn">Upload</button></form>`)}
  ${card('Orthopedic assessments', `${list(record.orthopedicAssessments.map((a) => `${esc(a.attestation.clinicianName)} · ${fmtDate(a.attestation.assessmentDate)}
      <br><small>${esc(a.attestation.instructions)}</small>
      ${record.restrictionsReviewed[a.id] ? '' : ` <button class="btn small" data-action="reviewed" data-id="${a.id}">I have read the written restrictions</button>`}`))}
    <a class="btn primary" href="#/assessment">Enter specialist findings</a>`)}
  ${card('Clinician authorizations', `${auths ? `<ul>${auths}</ul>` : '<p class="muted">None documented. Restricted activities stay locked.</p>'}
    <a class="btn" href="#/authorize">Add authorization from a letter</a>`)}
  ${card('Other clinical decisions', `<div class="btns"><a class="btn" href="#/phase">Record phase change</a><a class="btn" href="#/review">Record clinical review</a></div>
    <p class="muted">A documented review releases any progression hold.</p>`)}
  ${card('Who must run functional tests', `<form data-form="rules">${C.RESTRICTED.map((c) => `<label class="check"><input type="checkbox" name="clinicianOnly" value="${c}" ${record.rules.clinicianAssessmentRequiredFor.includes(c) ? 'checked' : ''}> ${esc(C.catName(c))} — clinician only</label>`).join('')}
    <p class="muted">Unticked = your own test results count. Recommended: tick running, kettlebell and soccer if your specialist agrees.</p>
    <button class="btn">Save</button></form>`)}
  ${footer}`;
}

function viewAppointment(id) {
  const a = record.appointments.find((x) => x.id === id);
  if (!a) return '<p>Not found.</p>';
  return `<h1>${esc(a.title)}</h1><form data-form="appointment" data-id="${a.id}" class="card">
    <label>Title<input name="title" value="${esc(a.title)}" required></label>
    <label>Date and time<input type="datetime-local" name="scheduledAt" value="${a.scheduledAt ? dtInput(a.scheduledAt) : ''}"></label>
    <label>Clinician<input name="clinicianName" value="${esc(a.clinicianName ?? '')}"></label>
    <h3>Question checklist — bring this</h3>
    ${a.questions.map((q, i) => `<label class="q"><span>${i + 1}. ${esc(q.question)}</span><textarea name="q-${q.id}" rows="2" placeholder="Answer">${esc(q.answer ?? '')}</textarea></label>`).join('')}
    <label>Add a question<input name="newQuestion"></label>
    <button class="btn primary">Save</button></form>
    ${C.needsFindings(a, now()) ? '<a class="btn primary big" href="#/assessment">Enter findings now</a>' : ''}`;
}

const opts = (values, labeler = label) => values.map((v) => `<option value="${v}">${esc(labeler(v))}</option>`).join('');

function viewAssessment() {
  return `<h1>Specialist findings</h1><p class="muted">Record what the specialist wrote. Anything left "Not addressed" unlocks nothing.</p>
  <form data-form="assessment" class="card">${attestationFields()}
    <fieldset><legend>Diagnosis</legend>
      <label>Exact anatomical tear location<input name="tearLocation"></label>
      <label>Tendon involvement<input name="tendonInvolvement"></label>
      <label>Retraction or tendon gap<input name="retractionOrGap"></label>
      <label>Need for surgery<select name="surgery">${opts(['notAddressed', 'notRequired', 'recommended', 'undecidedFurtherImaging', 'referredToSurgeon'])}</select></label>
      <label>Treatment pathway<select name="treatmentPathway"><option value="">Not stated</option>${opts(['conservative', 'surgical'])}</select></label></fieldset>
    <fieldset><legend>Restrictions</legend>
      <label>Weight-bearing<select name="weightBearing">${opts(['notAddressed', 'fullWeightBearing', 'asTolerated', 'partial', 'nonWeightBearing'])}</select></label>
      <label>Weight-bearing notes<input name="weightBearingNotes"></label>
      <label>Approved range of motion<textarea name="approvedRangeOfMotion" rows="2"></textarea></label>
      <label>Strength-training restrictions<textarea name="strengthTrainingRestrictions" rows="2"></textarea></label></fieldset>
    <fieldset><legend>Approved isometric exercises</legend>
      <label>One per line: <em>Exercise — dose</em><textarea name="approvedIsometrics" rows="3" placeholder="Quadriceps set — 5 × 10 s at 30% effort, twice daily"></textarea></label></fieldset>
    <fieldset><legend>Cycling</legend>
      <label>Clearance<select name="cyclingClearance">${opts(['notAddressed', 'notCleared', 'stationaryOnly', 'stationaryAndOutdoor'])}</select></label>
      <label>Conditions (seat height, resistance, minutes)<input name="cyclingConditions"></label></fieldset>
    <fieldset><legend>Next steps</legend>
      <label>Physiotherapy referral<select name="physiotherapyReferral"><option value="">Not stated</option><option value="true">Yes</option><option value="false">No</option></select></label>
      <label>Follow-up appointment<input type="datetime-local" name="followUpDate"></label></fieldset>
    <button class="btn primary big">Save findings</button></form>`;
}

function viewAuthorize() {
  return `<h1>Add authorization</h1><p class="muted">Use only for what a clinician approved in writing.</p>
  <form data-form="authorize" class="card">
    <label>Activity<select name="category" required>${opts(C.RESTRICTED, C.catName)}</select></label>
    <label>Exercises, one per line: <em>Exercise — dose</em><textarea name="exercises" rows="3" required></textarea></label>
    <label>Expires (optional)<input type="date" name="expiresOn"></label>
    ${attestationFields()}<button class="btn primary">Save authorization</button></form>`;
}

function viewPhase() {
  return `<h1>Phase change</h1><p class="muted">Phases never change automatically.</p>
  <form data-form="phase" class="card"><label>New phase<select name="phase">${opts(Object.keys(C.PHASES), (k) => C.PHASES[k])}</select></label>
    ${attestationFields()}<button class="btn primary">Save</button></form>`;
}

function viewReview() {
  return `<h1>Clinical review</h1><p class="muted">Releases any progression hold that started before the review date.</p>
  <form data-form="review" class="card">${attestationFields()}<label>Outcome<textarea name="outcome" rows="3" required></textarea></label>
    <button class="btn primary">Save</button></form>`;
}

// ───────────────────────── Progress ─────────────────────────

function painChart() {
  const pts = C.trendSeries(record.checkIns).slice(-60);
  if (pts.length < 2) return '<p class="muted">Chart appears after two check-ins.</p>';
  const W = 340, H = 160, L = 24, B = 20, t0 = ms(pts[0].date), t1 = ms(pts.at(-1).date) || t0 + 1;
  const x = (d) => L + ((ms(d) - t0) / Math.max(1, t1 - t0)) * (W - L - 6);
  const y = (v) => 6 + (1 - v / 10) * (H - B - 6);
  const line = (key, cls) => `<polyline class="${cls}" points="${pts.map((p) => `${x(p.date).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')}"/>`;
  const grid = [0, 5, 10].map((v) => `<line class="grid" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v) + 4}">${v}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Pain trend">${grid}
    ${line('walkingPain', 's1')}${line('restingPain', 's2')}${line('walkingPain7DayAverage', 's3')}
    <text x="${L}" y="${H - 4}">${fmtDate(pts[0].date)}</text><text x="${W}" y="${H - 4}" text-anchor="end">${fmtDate(pts.at(-1).date)}</text></svg>
    <p class="legend"><span class="k s1"></span>Walking <span class="k s2"></span>Resting <span class="k s3"></span>Walking 7-day avg</p>`;
}

function healthSummary() {
  const h = record.health;
  if (!h.importedAt) return '<p class="muted">No Apple Health data imported yet.</p>';
  const days = [...new Set(Object.values(h.daily).map((d) => d.day))].sort().slice(-14).reverse();
  const cell = (m, dday, f) => { const v = C.dailyValue(record, m, dday); return v ? f(v) : '<span class="muted">—</span>'; };
  const recent = h.workouts.filter((w) => ms(w.start) > ms(now()) - 30 * 864e5).reverse();
  return `<p class="muted">Imported ${fmtDateTime(h.importedAt)} · export from ${h.exportDate ? fmtDateTime(h.exportDate) : 'unknown'}. “—” means no data, not zero.</p>
    <div class="scroll"><table><thead><tr><th>Day</th><th>Steps</th><th>Walk km</th><th>Bike km</th><th>Rest HR</th><th>Sleep h</th></tr></thead><tbody>
    ${days.map((dd) => `<tr><td>${dd.slice(5)}</td><td>${cell('steps', dd, (v) => Math.round(v.value))}</td>
      <td>${cell('walkingRunningDistance', dd, (v) => (v.value / 1000).toFixed(1))}</td><td>${cell('cyclingDistance', dd, (v) => (v.value / 1000).toFixed(1))}</td>
      <td>${cell('restingHeartRate', dd, (v) => Math.round(v.value))}</td><td>${cell('sleep', dd, (v) => (v.value / 60).toFixed(1))}</td></tr>`).join('')}
    </tbody></table></div>
    <h3>Workouts (30 days)</h3>${list(recent.map((w) => `${esc(w.type)} · ${fmtDateTime(w.start)} · ${Math.round(w.durationSeconds / 60)} min${w.distanceMetres ? ` · ${(w.distanceMetres / 1000).toFixed(1)} km` : ''} <small class="muted">${esc(w.source)}</small>`))}`;
}

function viewProgress() {
  const fa = [...record.functionalAssessments].sort((a, b) => ms(b.date) - ms(a.date));
  return `<h1>Progress</h1>
  ${card('Symptoms', `${painChart()}<p class="muted">${esc(C.TREND_CAPTION)}</p>`)}
  ${card('Functional tests', `${list(fa.map((f) => `${esc(C.TESTS[f.test])} — <strong>${f.passed ? 'passed' : 'not yet'}</strong> · ${fmtDate(f.date)}
      <small class="muted">${f.assessorRole === 'clinician' ? `clinician: ${esc(f.assessedBy)}` : 'self-assessed'}${f.result ? ` · ${esc(f.result)}` : ''}</small>`))}
    <details><summary>Record a test result</summary><form data-form="test">
      <label>Test<select name="test">${opts(Object.keys(C.TESTS), (k) => C.TESTS[k])}</select></label>
      <label>Date<input type="date" name="date" value="${dateInput(now())}" max="${dateInput(now())}" required></label>
      <fieldset><legend>Result</legend>${segmented('passed', ['true', 'false'], (v) => (v === 'true' ? 'Passed' : 'Not yet'))}</fieldset>
      <label>Details (numbers, side-to-side, pain)<input name="result"></label>
      <label>Who ran it<select name="assessorRole"><option value="patientSelfAssessed">Me (self-assessed)</option><option value="clinician">A clinician</option></select></label>
      <label>Name<input name="assessedBy" value="Me" required></label>
      <button class="btn">Save result</button></form></details>`)}
  ${card('Completed stages (prerequisites)', `${list(record.completions.map((c) => `${esc(C.catName(c.category))} · ${fmtDate(c.completedOn)} · ${esc(c.documentedBy)}`))}
    <details><summary>Document a completed stage</summary><form data-form="completion">
      <label>Stage<select name="category">${opts(C.RESTRICTED, C.catName)}</select></label>
      <label>Completed on<input type="date" name="completedOn" value="${dateInput(now())}" max="${dateInput(now())}" required></label>
      <label>Documented by<input name="documentedBy" value="Me" required></label>
      <label>Note<input name="note"></label><button class="btn">Save</button></form></details>`)}
  ${card('Apple Health — performance only', `${healthSummary()}
    <details><summary>Import from Apple Health</summary>
      <ol class="steps"><li>Health app → your picture → <em>Export All Health Data</em>.</li><li>Save to Files, then tap the .zip to unzip it.</li>
      <li>Pick <code>export.xml</code> below. Large files can take a minute.</li></ol>
      <input type="file" id="healthFile" accept=".xml,text/xml,application/xml"><progress id="healthProgress" value="0" max="1" hidden></progress>
    </details>
    <p class="muted">Health data is recorded for context. It never unlocks exercises or counts as clinical clearance.</p>`)}
  ${footer}`;
}

// ───────────────────────── Data ─────────────────────────

function viewData() {
  return `<h1>Data & setup</h1>
  ${card('Backup', `<p>Your data lives only on this phone. Back up weekly and keep the file in iCloud Drive or Files.</p>
    <p class="muted">Last backup: ${record.meta?.lastBackupAt ? fmtDateTime(record.meta.lastBackupAt) : 'never'}</p>
    <button class="btn primary" data-action="backup">Export backup</button>
    <label class="filebtn">Restore from backup<input type="file" id="restoreFile" accept="application/json,.json"></label>`)}
  ${card('Reminders', `<p>Web apps on iPhone can't send their own reminders. This adds your appointments (alerts 72 h, 24 h and 2 h before),
    a "record findings" prompt after each, and a daily 8 pm check-in to Apple Calendar.</p>
    <button class="btn" data-action="ics">Add reminders to Calendar</button>
    <p class="muted">If nothing happens in the home-screen app, open this site in Safari and tap it there.</p>`)}
  ${card('Install', `<ol class="steps"><li>Open this page in <strong>Safari</strong>.</li><li>Share → <strong>Add to Home Screen</strong>.</li>
    <li>Always open it from the home-screen icon. That keeps your data safe from Safari's 7-day cleanup.</li></ol>
    <p class="muted">Installed: ${isStandalone() ? 'yes' : 'no'} · Storage protected: <span id="persisted">checking…</span></p>`)}
  ${card('About', `<p>Rectus Recovery · configuration v${esc(record.configurationVersion)}</p>${footer}`)}`;
}

// ───────────────────────── Router ─────────────────────────

const routes = [
  [/^#\/today$/, viewToday], [/^#\/checkin$/, viewCheckIn], [/^#\/plan$/, viewPlan], [/^#\/clinical$/, viewClinical],
  [/^#\/progress$/, viewProgress], [/^#\/data$/, viewData], [/^#\/log\/(\w+)$/, viewLog], [/^#\/appointment\/([\w-]+)$/, viewAppointment],
  [/^#\/assessment$/, viewAssessment], [/^#\/authorize$/, viewAuthorize], [/^#\/phase$/, viewPhase], [/^#\/review$/, viewReview],
];
const tabs = [['#/today', 'Today'], ['#/checkin', 'Check-in'], ['#/plan', 'Plan'], ['#/clinical', 'Clinical'], ['#/progress', 'Progress'], ['#/data', 'Data']];

function render() {
  const hash = location.hash || '#/today';
  let html = '<p>Not found.</p>';
  for (const [re, view] of routes) { const m = hash.match(re); if (m) { html = view(...m.slice(1)); break; } }
  app.innerHTML = `<main>${flashHtml()}${html}</main>
    <nav class="tabs">${tabs.map(([h, t]) => `<a href="${h}" class="${hash.startsWith(h) ? 'active' : ''}">${t}</a>`).join('')}</nav>`;
  if (hash === '#/data') S.persist().then((p) => { const el = document.getElementById('persisted'); if (el) el.textContent = p ? 'yes' : 'no'; });
}

// ───────────────────────── Forms ─────────────────────────

const forms = {
  async log(f, fd) {
    const cat = f.dataset.cat;
    await commit((r) => C.logActivity(r, { date: now().toISOString(), category: cat, exerciseName: fd.get('exerciseName'),
      durationMinutes: Number(fd.get('durationMinutes')), notes: fd.get('notes') }));
    go('#/today', { kind: 'ok', html: `Logged ${esc(fd.get('exerciseName'))}.` });
  },
  async checkin(f, fd) {
    const draft = Object.fromEntries(['restingPain', 'walkingPain', 'limp', 'swelling', 'stiffness', 'nextDayResponse', 'notes']
      .map((k) => [k, fd.get(k)]));
    Object.assign(draft, { date: now(), newWeakness: fd.get('newWeakness') === 'true' ? true : fd.get('newWeakness') === 'false' ? false : null,
      activityDurationMinutes: fd.get('activityDurationMinutes'), redFlags: fd.getAll('redFlags') });
    const c = C.validateCheckIn(draft);
    const ev = await commit((r) => C.addCheckIn(r, c));
    go('#/today', ev.level === 'stable' ? { kind: 'ok', html: esc(C.evaluationMessage(ev)) } : null);
  },
  async extend() {
    await commit((r) => C.extendPlan(r, 4, 'Extended by patient', now()));
    go('#/plan', { kind: 'ok', html: 'Plan extended by 4 weeks. History kept.' });
  },
  async addAppointment(f, fd) {
    const kind = fd.get('kind');
    await commit((r) => C.addAppointment(r, { kind, title: `${label(kind)} appointment`, scheduledAt: null,
      questions: kind === 'orthopedic' ? C.ORTHO_QUESTIONS.map((q) => ({ id: crypto.randomUUID(), question: q, answer: '' })) : [] }));
    go(`#/appointment/${record.appointments.at(-1).id}`);
  },
  async appointment(f, fd) {
    const a = structuredClone(record.appointments.find((x) => x.id === f.dataset.id));
    a.title = fd.get('title');
    a.scheduledAt = fd.get('scheduledAt') ? new Date(fd.get('scheduledAt')).toISOString() : null;
    a.clinicianName = fd.get('clinicianName') || null;
    for (const q of a.questions) q.answer = fd.get(`q-${q.id}`) ?? q.answer;
    if (fd.get('newQuestion')?.trim()) a.questions.push({ id: crypto.randomUUID(), question: fd.get('newQuestion').trim(), answer: '' });
    await commit((r) => C.updateAppointment(r, a));
    go(`#/appointment/${a.id}`, { kind: 'ok', html: 'Saved. Use “Add reminders to Calendar” to update alerts.' });
  },
  async upload(f, fd) {
    const file = fd.get('file');
    if (!file?.size) throw new Error('Choose a file.');
    const id = crypto.randomUUID();
    await S.putDoc(id, file);
    await commit((r) => C.addDocument(r, { id, kind: fd.get('kind'), title: fd.get('title'), mimeType: file.type,
      documentDate: fromDateInput(fd.get('documentDate')).toISOString(), storedFileName: file.name }));
    go('#/clinical', { kind: 'ok', html: 'Document stored on this phone.' });
  },
  async assessment(f, fd) {
    const s = (k) => fd.get(k)?.trim() || null;
    const a = {
      attestation: readAttestation(fd), tearLocation: s('tearLocation'), tendonInvolvement: s('tendonInvolvement'),
      retractionOrGap: s('retractionOrGap'), surgery: fd.get('surgery'), weightBearing: fd.get('weightBearing'),
      weightBearingNotes: s('weightBearingNotes'), approvedRangeOfMotion: s('approvedRangeOfMotion'),
      approvedIsometrics: parseExercises(fd.get('approvedIsometrics')), cyclingClearance: fd.get('cyclingClearance'),
      cyclingConditions: s('cyclingConditions'), strengthTrainingRestrictions: s('strengthTrainingRestrictions'),
      physiotherapyReferral: fd.get('physiotherapyReferral') === '' ? null : fd.get('physiotherapyReferral') === 'true',
      followUpDate: fd.get('followUpDate') ? new Date(fd.get('followUpDate')).toISOString() : null,
      treatmentPathway: s('treatmentPathway'), additionalApprovals: [],
    };
    await commit((r) => C.recordOrthopedicAssessment(r, a, now()));
    const auths = C.derivedAuthorizations(a);
    go('#/today', { kind: 'ok', html: `Findings saved. ${auths.length
      ? `Recorded exactly as written: ${auths.map((x) => `${esc(C.catName(x.category))} (${x.approvedExercises.length} exercise${x.approvedExercises.length === 1 ? '' : 's'})`).join(', ')}.`
      : 'Nothing was unlocked — no exercises or cycling were approved.'}` });
  },
  async authorize(f, fd) {
    const att = readAttestation(fd);
    await commit((r) => C.addAuthorization(r, { category: fd.get('category'), approvedExercises: parseExercises(fd.get('exercises')),
      attestation: att, effectiveFrom: att.assessmentDate, expiresOn: fd.get('expiresOn') ? fromDateInput(fd.get('expiresOn')).toISOString() : null }, now()));
    go('#/clinical', { kind: 'ok', html: 'Authorization saved.' });
  },
  async phase(f, fd) {
    const att = readAttestation(fd);
    await commit((r) => C.recordPhaseChange(r, { phase: fd.get('phase'), effectiveDate: att.assessmentDate, attestation: att }, now()));
    go('#/today', { kind: 'ok', html: 'Phase updated.' });
  },
  async review(f, fd) {
    await commit((r) => C.recordClinicalReview(r, { attestation: readAttestation(fd), outcome: fd.get('outcome') }, now()));
    go('#/today', { kind: 'ok', html: 'Clinical review saved.' });
  },
  async rules(f, fd) {
    await commit((r) => { r.rules.clinicianAssessmentRequiredFor = fd.getAll('clinicianOnly'); });
    go('#/clinical', { kind: 'ok', html: 'Saved.' });
  },
  async test(f, fd) {
    await commit((r) => C.recordFunctionalAssessment(r, { test: fd.get('test'), date: pastDateInput(fd.get('date')),
      passed: fd.get('passed') === 'true', result: fd.get('result'), assessedBy: fd.get('assessedBy'), assessorRole: fd.get('assessorRole') }));
    go('#/progress', { kind: 'ok', html: 'Result saved.' });
  },
  async completion(f, fd) {
    await commit((r) => C.recordCompletion(r, { category: fd.get('category'), completedOn: pastDateInput(fd.get('completedOn')),
      documentedBy: fd.get('documentedBy'), note: fd.get('note') }));
    go('#/progress', { kind: 'ok', html: 'Saved.' });
  },
};

const actions = {
  async revoke(el) {
    const reason = prompt('Why is this authorization revoked? (e.g. clinician withdrew it)');
    if (!reason) return;
    await commit((r) => C.revokeAuthorization(r, el.dataset.id, now(), reason));
    go('#/clinical', { kind: 'ok', html: 'Revoked. History kept.' });
  },
  async reviewed(el) {
    await commit((r) => C.markRestrictionsReviewed(r, el.dataset.id, now()));
    go('#/clinical');
  },
  async openDoc(el) {
    const b = await S.getDoc(el.dataset.id);
    if (!b) throw new Error('File not found on this device (restore a backup that includes it).');
    const url = URL.createObjectURL(b);
    window.open(url, '_blank') ?? (location.href = url);
  },
  async ics() {
    await shareOrDownload(new Blob([C.buildICS(record, now())], { type: 'text/calendar' }), 'rectus-recovery.ics');
  },
  async backup() {
    const blob = await S.exportBackup(record);
    await commit((r) => { r.meta = { ...(r.meta ?? {}), lastBackupAt: now().toISOString() }; });
    await shareOrDownload(blob, `rectus-recovery-backup-${dateInput(now())}.json`);
    render();
  },
};

document.addEventListener('submit', async (e) => {
  const f = e.target, h = forms[f.dataset.form];
  if (!h) return;
  e.preventDefault();
  const btn = f.querySelector('button:not([type=button])');
  if (btn) btn.disabled = true;
  try { await h(f, new FormData(f)); } catch (err) { fail(err); } finally { if (btn) btn.disabled = false; }
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.preventDefault();
  try { await actions[el.dataset.action](el); } catch (err) { fail(err); }
});

document.addEventListener('change', async (e) => {
  try {
    if (e.target.id === 'healthFile' && e.target.files[0]) await importHealth(e.target.files[0]);
    if (e.target.id === 'restoreFile' && e.target.files[0]) {
      if (!confirm('Replace everything on this phone with this backup?')) return;
      const r = C.migrate(await S.importBackup(e.target.files[0]));
      await S.saveRecord(r);
      record = r;
      go('#/today', { kind: 'ok', html: 'Backup restored.' });
    }
  } catch (err) { fail(err); }
});

async function importHealth(file) {
  const bar = document.getElementById('healthProgress');
  bar.hidden = false;
  const since = new Date(ms(record.profile.injuryDate) - 30 * 864e5);
  const p = C.createHealthParser({ since }), dec = new TextDecoder(), step = 8 * 1024 * 1024;
  for (let i = 0; i < file.size; i += step) {
    p.push(dec.decode(await file.slice(i, i + step).arrayBuffer(), { stream: true }));
    bar.value = Math.min(1, (i + step) / file.size);
    await new Promise((r) => setTimeout(r, 0));
  }
  p.push(dec.decode());
  const parsed = p.finish();
  if (!parsed.exportDate && !parsed.records && !parsed.workouts.length) throw new Error('No Apple Health records found. Pick export.xml from the unzipped folder.');
  const res = await commit((r) => C.replaceHealthData(r, parsed, now()));
  go('#/progress', { kind: 'ok', html: `Imported ${res.days} days and ${res.workouts} workouts since ${fmtDate(since)}. This does not change any clearance.` });
}

// ───────────────────────── Boot ─────────────────────────

async function boot() {
  try {
    const saved = await S.loadRecord();
    record = saved ? C.migrate(saved) : C.initialRecord();
    if (!saved) await S.saveRecord(record);
  } catch (e) {
    app.innerHTML = `<main><div class="banner error">Could not open on-device storage: ${esc(e.message)}. Private Browsing blocks storage — open in a normal Safari tab.</div></main>`;
    return;
  }
  window.addEventListener('hashchange', render);
  if (!location.hash) history.replaceState(null, '', '#/today');
  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
