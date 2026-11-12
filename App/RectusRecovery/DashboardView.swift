import SwiftUI
import RectusRecoveryCore

struct DashboardView: View {
    @EnvironmentObject var model: AppModel
    @State private var logging: ActivityCategory?

    var body: some View {
        let d = model.dashboard
        NavigationStack {
            List {
                Section {
                    Text(d.statusLabel).font(.title3.bold())
                    Text("Week \(d.calendarWeek) since injury · day \(d.daysSinceInjury) · phase set by clinician: \(d.phase.displayName)")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if let e = d.symptomEvaluation, e.level != .stable {
                    Section { SymptomBanner(evaluation: e) }
                }
                if d.checkInDueToday {
                    Section { NavigationLink("Daily symptom check-in is due") { CheckInView() } }
                }
                if !d.appointmentsNeedingFindings.isEmpty {
                    Section("Action needed") {
                        ForEach(d.appointmentsNeedingFindings) { a in
                            NavigationLink("Enter findings from \(a.title)") { AssessmentFormView(appointmentID: a.id) }
                        }
                    }
                }
                Section("Pending milestones") {
                    ForEach(d.pendingMilestones, id: \.self) { Text($0) }
                }
                Section("You may log") {
                    ForEach(d.permittedLogging, id: \.self) { c in
                        Button(c.displayName) { logging = c }
                    }
                    ForEach(d.available.keys.sorted(), id: \.self) { c in
                        Button("\(c.displayName) — clinician-approved") { logging = c }
                    }
                }
                Section {
                    ForEach(d.documentOnly, id: \.self) { c in Button(c.displayName) { logging = c } }
                } header: { Text("Document only") } footer: {
                    Text("Recorded as activity. Not prescribed or medically cleared by this app.")
                }
                Section("Restricted until documented clinician authorization") {
                    ForEach(d.restricted.keys.sorted(), id: \.self) { c in
                        DisclosureGroup {
                            ForEach(d.restricted[c]!, id: \.self) { Text($0.description).font(.footnote) }
                        } label: { Label(c.displayName, systemImage: "lock.fill") }
                    }
                }
                Section { SafetyFooter() }
            }
            .navigationTitle("Rectus Recovery")
            .sheet(item: $logging) { ActivityLogSheet(category: $0) }
        }
    }
}


struct ActivityLogSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    let category: ActivityCategory
    @State private var exercise = ""
    @State private var minutes = 15
    @State private var notes = ""

    var body: some View {
        let access = model.record.access(category, at: model.now)
        NavigationStack {
            Form {
                switch access {
                case .available(let ex, let caution):
                    if let caution { Text(caution).foregroundStyle(.orange) }
                    Picker("Exercise", selection: $exercise) {
                        Text("Choose").tag("")
                        ForEach(ex, id: \.name) { Text("\($0.name) — \($0.parameters)").tag($0.name) }
                    }
                case .documentOnly:
                    TextField("What you did", text: $exercise)
                    Text("Documented only. Ask your clinician which upper-body positions are safe.").font(.footnote)
                case .locked(let reasons):
                    ForEach(reasons, id: \.self) { Text($0.description) }
                }
                Stepper("Duration: \(minutes) min", value: $minutes, in: 1...240)
                TextField("Notes", text: $notes, axis: .vertical)
            }
            .navigationTitle(category.displayName)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let entry = ActivityLogEntry(date: model.now, category: category, exerciseName: exercise,
                                                     durationMinutes: minutes, notes: notes)
                        if model.mutate({ try $0.logActivity(entry) }) { dismiss() }
                    }.disabled(exercise.isEmpty || !access.isAvailable && access != .documentOnly)
                }
            }
        }
    }
}
