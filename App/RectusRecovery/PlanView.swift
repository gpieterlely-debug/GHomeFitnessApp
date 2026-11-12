import SwiftUI
import RectusRecoveryCore

/// Calendar weeks with the six required columns kept separate.
struct PlanView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        let weeks = model.record.weeklySummaries(asOf: model.now, calendar: model.calendar)
        NavigationStack {
            List(weeks.reversed(), id: \.calendarWeek) { w in
                DisclosureGroup {
                    row("Clinical phase", w.clinicalPhases.isEmpty ? ["Not set — clinician decides"] : w.clinicalPhases.map(\.displayName))
                    row("Clinician-approved", w.approvedExercises.isEmpty ? ["None documented"] : w.approvedExercises)
                    row("Completed", w.completedActivities.isEmpty ? ["Nothing logged"] :
                        w.completedActivities.map { "\($0.exerciseName) · \($0.durationMinutes) min\($0.isDocumentationOnly ? " (documented only)" : "")" })
                    row("Restricted", w.restrictedActivities.map(\.displayName))
                    if !w.pendingMilestones.isEmpty { row("Pending milestones", w.pendingMilestones) }
                    if !w.clinicalEvents.isEmpty { row("Clinical events", w.clinicalEvents) }
                } label: {
                    HStack {
                        Text("Week \(w.calendarWeek)").bold()
                        Text(w.dates.lowerBound.formatted(date: .abbreviated, time: .omitted)).foregroundStyle(.secondary)
                        Spacer()
                        if w.status == .current { Text("NOW").font(.caption.bold()) }
                        if w.isProvisional { Text("provisional").font(.caption) }
                        if w.isExtension { Text("extended").font(.caption) }
                    }
                }
            }
            .navigationTitle("Recovery plan")
            .toolbar {
                Button("Extend 4 weeks") {
                    model.mutate { $0.plan.extend(by: 4, reason: "Extended by patient/clinician", on: Date()) }
                }
            }
        }
    }

    func row(_ title: String, _ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            ForEach(items, id: \.self) { Text($0).font(.subheadline) }
        }
    }
}
