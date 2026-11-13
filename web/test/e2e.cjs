// End-to-end smoke test in Chromium at iPhone size. Run: node test/e2e.cjs (server on :8080).
const { chromium } = require('playwright');
const assert = require('assert/strict');
const BASE = process.env.BASE ?? 'http://localhost:8080/';
const SHOTS = process.env.SHOTS;
const NOW = '2026-11-13T10:00:00';

const HK = `<?xml version="1.0"?><HealthData><ExportDate value="2026-11-13 09:00:00 +0000"/>
<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-11-12 08:00:00 +0000" endDate="2026-11-12 09:00:00 +0000" value="4200"/>
<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" sourceName="Apple Watch" startDate="2026-11-12 07:00:00 +0000" endDate="2026-11-12 08:00:00 +0000">
 <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" sum="30" unit="km"/></Workout></HealthData>`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true, timezoneId: 'Europe/Amsterdam' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const open = async (hash) => { await page.goto(`${BASE}?now=${NOW}${hash}`); await page.waitForSelector('nav.tabs'); };
  const text = () => page.locator('main').innerText();
  const noHScroll = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal scroll');

  // 1. Initial state
  await open('#/today');
  let t = await text();
  assert.match(t, /PROTECTION — AWAITING CLINICAL ASSESSMENT/);
  assert.match(t, /Week 4 since injury · day 22/);
  assert.match(t, /Orthopedic assessment — booked/);
  assert.match(t, /Daily symptom check-in is due/);
  await noHScroll();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-today.png`, fullPage: true });

  // 2. Check-in requires every field, then saves
  await open('#/checkin');
  await page.click('text=Save check-in');
  assert.ok(await page.evaluate(() => !document.querySelector('form').checkValidity()), 'incomplete form must not submit');
  const pick = (n, v) => page.locator(`input[name=${n}][value="${v}"] + span`).click();
  await pick('restingPain', '1'); await pick('walkingPain', '3'); await pick('limp', 'none'); await pick('swelling', 'none');
  await pick('stiffness', 'mild'); await pick('newWeakness', 'false'); await pick('nextDayResponse', 'same');
  await page.fill('input[name=activityDurationMinutes]', '30');
  await noHScroll();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-checkin.png`, fullPage: false });
  await page.click('text=Save check-in');
  await page.waitForSelector('.banner.ok');
  assert.match(await text(), /does not prove the tendon has healed/);

  // 3. Restricted logging is blocked
  await open('#/log/stationaryCycling');
  assert.match(await text(), /No documented clinician authorization/);

  // 4. Apple Health 30 km ride: recorded, not clearance
  await open('#/progress');
  await page.click('text=Import from Apple Health');
  await page.setInputFiles('#healthFile', { name: 'export.xml', mimeType: 'text/xml', buffer: Buffer.from(HK) });
  await page.waitForSelector('text=does not change any clearance');
  assert.match(await text(), /Cycling · .* 30\.0 km/);
  await open('#/today');
  t = await text();
  assert.match(t, /AWAITING CLINICAL ASSESSMENT/);
  assert.match(t, /🔒 Stationary cycling/);

  // 5. Findings need a source document; then isometrics unlock exactly as written
  await open('#/clinical');
  await page.setInputFiles('input[name=file]', { name: 'letter.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await page.fill('input[name=title]', 'Ortho letter');
  await page.click('form[data-form=upload] button');
  await page.waitForSelector('text=Document stored');
  await open('#/assessment');
  await page.fill('input[name=clinicianName]', 'Dr. Test');
  await page.selectOption('select[name=sourceDocumentID]', { index: 1 });
  await page.fill('textarea[name=instructions]', 'Isometrics only. No cycling yet.');
  await page.fill('textarea[name=approvedIsometrics]', 'Quadriceps set — 5 × 10 s at 30%\nGluteal squeeze — 5 × 10 s');
  await page.selectOption('select[name=cyclingClearance]', 'notCleared');
  await page.click('text=Save findings');
  await page.waitForSelector('text=Gentle isometric strengthening (2 exercises)');
  t = await text();
  assert.match(t, /PROTECTION — CLINICIAN-DIRECTED/);
  assert.match(t, /Gentle isometric strengthening\s+clinician-approved/);
  assert.match(t, /🔒 Stationary cycling/);
  await open('#/log/gentleIsometrics');
  const options = await page.locator('select[name=exerciseName] option').allInnerTexts();
  assert.deepEqual(options.slice(1).map((o) => o.split(' — ')[0]).sort(), ['Gluteal squeeze', 'Quadriceps set']);
  await page.selectOption('select[name=exerciseName]', 'Quadriceps set');
  await page.click('form[data-form=log] button');
  await page.waitForSelector('text=Logged Quadriceps set');

  // 6. Worsening → hold banner, persists across reload
  await open('#/checkin');
  await pick('restingPain', '2'); await pick('walkingPain', '5'); await pick('limp', 'mild'); await pick('swelling', 'none');
  await pick('stiffness', 'mild'); await pick('newWeakness', 'false'); await pick('nextDayResponse', 'same');
  await page.fill('input[name=activityDurationMinutes]', '10');
  await page.click('text=Save check-in');
  await page.waitForSelector('.banner.worsening');
  await page.reload();
  await page.waitForSelector('.banner.worsening');
  assert.match(await text(), /Hold progression/);
  assert.match(await text(), /Clinical review of worsening symptoms/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-hold.png`, fullPage: false });

  // 7. Plan and calendar
  await open('#/plan');
  assert.equal(await page.locator('details.week').count(), 16);
  await noHScroll();
  for (const h of ['#/clinical', '#/progress', '#/data']) { await open(h); await noHScroll(); }

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
