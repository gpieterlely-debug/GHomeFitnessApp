# Rectus Recovery — Specification v2.1

**Clinical Configuration Update v2.1 · 12 Nov 2026**

> **Note on version history:** this repository had no earlier Rectus Recovery spec. v2.1 is the first one written down here. Earlier versions (if any) are not in version control.

## 0. Design principle

1. Build a **recovery management system**, not a fixed workout calendar.
2. **Clinical clearance** controls permitted activities.
3. **Symptoms** guide monitoring.
4. **Functional testing** supports progression.
5. **Fitness data** tracks performance. It never establishes medical readiness.

The app **records** clinical decisions. It never makes them.

---

## 1. Patient configuration (seeded by `ClinicalConfiguration.initialRecord`)

| Field | Value |
|---|---|
| Injury date | 22 Oct 2026 |
| Assessment date for this config | 12 Nov 2026 (day 21, calendar week 4) |
| Injury | High-grade partial **left** rectus femoris tendon tear, with rectus femoris and iliopsoas muscle injury |
| MRI | Mild tendon laxity, no complete retraction |
| Walking pain | 2–3/10 → baseline stored as **3** (conservative) |
| Resting pain | Not reported → baseline **0** (**ASSUMPTION**: confirm at first check-in) |
| Tolerated activity | Walking |
| Orthopedic status | Awaiting assessment |
| Physiotherapy | Not started |
| Treatment pathway | Not yet confirmed |
| Goals | Cycling, running, kettlebell workouts, kicking a soccer ball |
| Kettlebells | 8, 12, 16, 18, 20, 24, 28 kg |

**Orthopedic workflow while awaiting assessment:**
1. Appointment reminders: 72 h, 24 h and 2 h before.
2. A clinical question checklist (14 questions), pre-filled.
3. A prompt to enter the specialist's findings 2 h after the appointment, which stays on the dashboard until findings are recorded.
4. Restricted exercises stay locked until an authorization is documented.

## 2. Initial app state

**Status:** `PROTECTION — AWAITING CLINICAL ASSESSMENT`

| Access | Categories |
|---|---|
| **Permitted logging** | Comfortable walking, gentle supported ankle mobility, daily symptoms, sleep/recovery (via Health), appointments, MRI and other document uploads |
| **Document only** | Supported upper-body exercise. It can be logged but is never shown as prescribed or cleared. |
| **Restricted** | Gentle isometrics, controlled hip/knee strengthening, hip-flexor strengthening, progressive lower-body resistance, stationary cycling, outdoor cycling, running, dynamic kettlebell, soccer-specific |

Nothing restricted is pre-authorized.

## 3. Rehabilitation schedule

- A provisional 16-week plan starts 22 Oct 2026.
- Each week shows **separate** columns: calendar week · clinical phase · clinician-approved exercises · completed activities · restricted activities · pending milestones (plus clinical events).
- **Calendar week is a label only.** It never changes access.
- **Phases change only through a `PhaseChange` that carries a clinician attestation.** The default phase is Protection.
- **The plan extends automatically** when today passes the planned length. Manual extensions are also logged. History is append-only, so extending never loses data.
- Future weeks are marked *provisional* and are never predicted.

## 4. Daily symptom monitoring

**Required fields** (the form will not save with any gap): resting pain, walking pain, limp, swelling, stiffness, new weakness, activity duration, and next-day response to yesterday's activity. There is also an optional red-flag checklist.

**Evaluation** (app defaults, **not validated clinical cut-offs**; see §11):

| Level | Triggers | App behavior |
|---|---|---|
| **Urgent** | Any red flag · resting pain ≥ 7 · walking pain ≥ 8 · cannot bear weight · severe swelling · walking pain ≥ 4 above baseline · a rise of 3+ points within 48 h | Urgent banner (stop, same-day medical assessment, local emergency number for chest pain / breathlessness / cold or numb leg). **All** restricted work locks. Released **only** by a documented clinical review. |
| **Worsening** | Walking or resting pain ≥ 2 above baseline · new or worse limp · new weakness · more swelling · worse the day after activity | "Hold progression" banner telling the patient to seek clinical review. No *new* category unlocks. Activities started before the hold continue only as directed, with no load increases. Released by a clinical review **or** 3 consecutive stable check-ins. |
| **Stable** | None of the above | "Stable pain does not prove the tendon has healed." |

- Baseline = median of the previous 7 check-ins. Before any check-ins exist, the profile values are used.
- Trend charts show walking pain, resting pain and a 7-day average, with this caption: *"Pain scores show how symptoms change. They do not show how well the tendon has healed."*

## 5. Orthopedic assessment workflow

The form captures:
- tear location
- tendon involvement
- retraction or gap
- need for surgery
- weight-bearing
- approved ROM
- approved isometrics (name + dose, exactly as written)
- cycling clearance (+ conditions)
- strength-training restrictions
- physio referral
- follow-up date
- treatment pathway

Every assessment requires:
1. a non-empty **clinician name**
2. an **assessment date** that is not in the future
3. **instructions**
4. a **source document** already uploaded to the app

Only explicit entries unlock anything. Any field left at **"Not addressed" unlocks nothing**.

## 6. Exercise progression

Each restricted category needs **all four** of these to become available:
1. An active **clinician authorization** that lists specific exercises. Only those exercises can be logged.
2. Passing results on the **functional assessments** it requires. The latest result counts, so a failed retest re-locks the category.
3. A **favorable symptom response**: a check-in within the last 72 h and no active hold.
4. **Documented completion of prerequisites.**

Default progression map (**ASSUMPTION**: an app scaffold for discussion with the clinician, not clinical guidance; replaceable via `ProgressionRules`):

| Category | Prerequisite | Functional assessments |
|---|---|---|
| Gentle isometrics | — | — (the orthopedic exam itself) |
| Controlled hip/knee | Isometrics | Walking without limp, pain-free SLR |
| Hip-flexor strengthening | Isometrics | Pain-free isometric hip flexion |
| Progressive lower-body | Controlled hip/knee | Full pain-free ROM, single-leg squat control |
| Stationary cycling | — | Walking without limp |
| Outdoor cycling | Stationary cycling | Single-leg squat control |
| Running | Progressive lower-body | Strength symmetry, hop symmetry |
| Dynamic kettlebell | Progressive lower-body | Single-leg squat control, strength symmetry |
| Soccer (incl. kicking) | Running + hip-flexor strengthening | Strength symmetry, hop symmetry, pain-free sprinting |

**Clearance is never inferred from Apple Health.** This is enforced in the architecture: `AccessEngine` reads `ClinicalEvidence`, which has no health-data field.

## 7. Apple HealthKit

- **Read-only** import of steps, walking/running distance, cycling distance, workouts, heart rate, resting heart rate and sleep (asleep stages only).
- **Anchored object queries** resume after offline periods and mirror deletions made in Health.
- **Duplicates:** samples with the same UUID are skipped, as are exact copies from another source and workouts of the same type that overlap by 80% or more (e.g., Watch + Strava).
- **Missing data:** missing data is returned as `nil`, never as 0. A metric with no new data for 3 days is labelled "no recent data".
- **Permission changes:** HealthKit does not reveal whether read access was denied. The app only records that it asked. Revoked access means no new data, and existing data is kept.
- **Offline:** everything is stored locally as JSON with iOS complete file protection. No network is needed.

## 8. MVP build order — status

| # | Item | Status |
|---|---|---|
| 1 | Clinical profile + injury timeline | ✅ Core + UI |
| 2 | Daily symptom check-in | ✅ Core + UI |
| 3 | Protection-mode dashboard | ✅ Core + UI |
| 4 | Clinical restrictions + approval workflow | ✅ Core + UI |
| 5 | Rehab exercise tracking | ✅ Core + UI |
| 6 | Functional progress charts | ✅ Symptom chart + assessment list; ⚠️ no UI yet for *entering* functional assessments or prerequisite completions (core API exists) |
| 7 | HealthKit integration | ✅ Code written; ⚠️ not yet compiled or run on a device |
| 8 | Exercise demonstrations + reminders | ✅ Reminders; ⚠️ demonstrations are placeholder text only |

## 9. Acceptance tests — `Tests/RectusRecoveryCoreTests/AcceptanceTests.swift`

| # | Scenario | Test | Result |
|---|---|---|---|
| 1 | No orthopedic clearance → cycling restricted | `test01_…` | ✅ pass |
| 2 | Week 6 without clearance → restricted stay locked | `test02_…` | ✅ pass |
| 3 | More pain + new limp → progression paused | `test03_…` | ✅ pass |
| 4 | Isometrics approved → only approved exercises available | `test04_…` | ✅ pass |
| 5 | Two weeks missed → no automatic phase advance | `test05_…` | ✅ pass |
| 6 | Health reports a 30 km ride → recorded, not clearance | `test06_…` | ✅ pass |
| 7 | Week 16 without functional criteria → rehab continues | `test07_…` | ✅ pass |

Plus 15 safety, HealthKit-deduplication and persistence tests. **22/22 pass** (Swift 6.0, Linux).

## 10. Architecture

```
Sources/RectusRecoveryCore/   Foundation-only, tested
  Profile.swift          profile, documents, ClinicianAttestation, errors
  Activities.swift       categories, functional tests, ProgressionRules, authorizations, log, library
  Symptoms.swift         check-in draft/validation, evaluator, trends, holds, reviews
  Clinical.swift         phases, orthopedic assessment form, appointments, reminders
  AccessEngine.swift     the single gate (no health data in its inputs)
  RecoveryRecord.swift   append-only record + all mutations
  Timeline.swift         plan, calendar weeks, weekly summaries, dashboard state
  HealthData.swift       HealthKit sample store (dedupe, deletions, anchors)
  Persistence.swift      offline JSON store
  Configuration.swift    v2.1 seed
App/RectusRecovery/           SwiftUI + HealthKit + notifications (iOS 17)
```

## 11. Known risks and open questions

1. **Thresholds are not clinically validated.** Pain deltas, the 72 h recency window, the 3-stable-check-in release and the progression map are conservative defaults. Have the treating clinician review them.
2. **Self-documented prerequisites.** Prerequisite completions and functional assessments can be entered by the patient. The clinician authorization is still required for each category, but the honesty of these entries is the weak link.
3. **Hold release by stable check-ins.** A worsening hold can clear without a clinician after 3 stable days. If this is too permissive, set `stableCheckInsToReleaseHold` very high so that a review is always required.
4. **Heart-rate volume.** Raw heart-rate samples can number tens of thousands per month in a single JSON file. Aggregate them to hourly statistics before beta.
5. **Regulatory.** As a personal tool this is fine. If it is distributed to other patients, an app that gates exercise based on symptoms may count as Software as a Medical Device (FDA / EU MDR). Get advice before sharing.
6. **Privacy.** Health data stays on the device. There is no cloud sync and no analytics. Keep it that way unless there is a consent design.
