import SwiftUI
import RectusRecoveryCore

@main
struct RectusRecoveryApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var health = HealthKitManager()

    var body: some Scene {
        WindowGroup {
            TabView {
                DashboardView().tabItem { Label("Today", systemImage: "cross.case") }
                CheckInView().tabItem { Label("Check-in", systemImage: "list.bullet.clipboard") }
                PlanView().tabItem { Label("Plan", systemImage: "calendar") }
                ClinicalView().tabItem { Label("Clinical", systemImage: "stethoscope") }
                ProgressChartsView().tabItem { Label("Progress", systemImage: "chart.xyaxis.line") }
            }
            .environmentObject(model)
            .environmentObject(health)
            .alert("Not saved", isPresented: Binding(get: { model.errorMessage != nil },
                                                     set: { if !$0 { model.errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(model.errorMessage ?? "") }
            .task { await NotificationScheduler.requestAuthorization() }
        }
    }
}

/// Shown on every screen that could be read as advice.
struct SafetyFooter: View {
    var body: some View {
        Text("This app records what your clinicians decide. It does not diagnose, clear, or prescribe. Pain scores and fitness data do not show tendon healing.")
            .font(.footnote)
            .foregroundStyle(.secondary)
    }
}

struct SymptomBanner: View {
    let evaluation: SymptomEvaluation
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(evaluation.level == .urgent ? "Urgent" : "Hold progression").font(.headline)
            Text(evaluation.message)
            ForEach(evaluation.reasons, id: \.self) { Text("• \($0)").font(.subheadline) }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(evaluation.level == .urgent ? Color.red.opacity(0.2) : Color.orange.opacity(0.2))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}
