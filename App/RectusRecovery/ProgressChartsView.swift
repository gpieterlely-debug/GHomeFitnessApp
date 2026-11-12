import SwiftUI
import Charts
import RectusRecoveryCore

struct ProgressChartsView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var health: HealthKitManager

    var body: some View {
        let points = SymptomTrends.series(model.record.checkIns)
        NavigationStack {
            List {
                Section {
                    Chart(points, id: \.date) { p in
                        LineMark(x: .value("Date", p.date), y: .value("Walking pain", p.walkingPain))
                            .foregroundStyle(by: .value("Series", "Walking pain"))
                        LineMark(x: .value("Date", p.date), y: .value("Resting pain", p.restingPain))
                            .foregroundStyle(by: .value("Series", "Resting pain"))
                        LineMark(x: .value("Date", p.date), y: .value("7-day avg", p.walkingPain7DayAverage))
                            .foregroundStyle(by: .value("Series", "Walking 7-day avg"))
                            .lineStyle(StrokeStyle(dash: [4, 3]))
                    }
                    .chartYScale(domain: 0...10)
                    .frame(height: 220)
                } header: { Text("Symptoms") } footer: { Text(SymptomTrends.caption) }

                Section("Functional assessments") {
                    if model.record.functionalAssessments.isEmpty { Text("None recorded yet.") }
                    ForEach(model.record.functionalAssessments.sorted { $0.date > $1.date }) { f in
                        LabeledContent(f.test.displayName, value: "\(f.passed ? "Passed" : "Not yet") · \(f.date.formatted(date: .abbreviated, time: .omitted))")
                    }
                }

                Section {
                    switch health.status {
                    case .unavailable: Text("Apple Health is not available on this device.")
                    case .notRequested: Button("Connect Apple Health (read-only)") { Task { await health.requestAndSync(model: model) } }
                    case .connected:
                        Button("Sync now") { Task { await health.requestAndSync(model: model) } }
                        ForEach(model.record.health.staleMetrics(now: Date()), id: \.self) {
                            Text("\($0.displayName): no recent data (not counted as zero)").font(.caption)
                        }
                    }
                    ForEach(recentWorkouts, id: \.id) { w in
                        LabeledContent(w.workoutActivity ?? "Workout",
                                       value: "\(w.start.formatted(date: .abbreviated, time: .shortened)) · \(String(format: "%.1f", w.value / 1000)) km")
                    }
                } header: { Text("Apple Health — performance only") } footer: {
                    Text("Health data is recorded for context. It never unlocks exercises or counts as clinical clearance.")
                }
            }
            .navigationTitle("Progress")
        }
    }

    var recentWorkouts: [HealthSample] {
        let start = Calendar.current.date(byAdding: .day, value: -14, to: Date())!
        return model.record.health.samples(.workout, in: start..<Date().addingTimeInterval(1)).reversed()
    }
}
