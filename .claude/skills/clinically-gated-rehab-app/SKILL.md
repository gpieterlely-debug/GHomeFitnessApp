---
name: clinically-gated-rehab-app
description: Build or update a rehab/recovery app where clinician authorization (not time, not fitness data) gates exercise access. Use when a user asks to spec or build an injury recovery, physio, or return-to-sport tracker, especially with HealthKit or wearable data.
---

# Clinically gated rehab app

## Core rules (non-negotiable)
1. Access = clinician authorization + functional tests + favorable symptoms + documented prerequisites. All four, every time.
2. Calendar week is a label. It never unlocks anything.
3. Phases change only through a clinician-attested event (name, date, instructions, stored source document).
4. Wearable/HealthKit data has no path into the access engine. Enforce structurally: the engine's input type has no health field.
5. "Not addressed" on a clinical form unlocks nothing.
6. Pain scores are symptoms, not proof of healing. Say so on every chart.
7. Worsening → hold progression + seek review. Red flags → urgent message, lock all restricted work, and release only by a documented review.
8. Records are append-only (revoke/release, never delete). Plans extend; history survives.

## Build steps
1. Put the rules in a Foundation-only Swift package so they test on Linux.
   - If no Swift is installed: `dockerd &` then `docker run --rm -v "$PWD":/work -w /work swift:6.0-noble swift test --scratch-path /tmp/build`.
2. Model: Profile, Documents, ClinicianAttestation, ActivityCategory (baseline: permitted / documentOnly / requiresAuthorization), ClinicalAuthorization (explicit exercise list), FunctionalAssessment (latest result counts), PrerequisiteCompletion, SymptomCheckInDraft (all required fields optional → validated()), ProgressionHold, ClinicalReview, PhaseChange, Appointment (+ checklist, reminders, findings prompt), HealthDataStore (UUID + fingerprint + workout-overlap dedupe, anchors, nil ≠ 0).
3. Write one XCTest per user acceptance scenario, named test01_… to test0N_….
4. Keep the SwiftUI layer thin: load → mutate(copy) → save → reschedule notifications.
5. HealthKit: read-only, HKAnchoredObjectQueryDescriptor, mirror deletions, treat denied reads as "no data".

## Always flag to the user
- Thresholds are app defaults, not validated clinical cut-offs → clinician review.
- Self-reported prerequisites are the weak link.
- SaMD/regulatory exposure if distributed beyond personal use.
- Raw heart-rate volume → aggregate before beta.
- Timing-sensitive clinical decisions (e.g., surgical windows) → push to get the specialist appointment booked.
