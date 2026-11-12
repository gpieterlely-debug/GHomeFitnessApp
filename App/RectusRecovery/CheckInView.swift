import SwiftUI
import RectusRecoveryCore

struct CheckInView: View {
    @EnvironmentObject var model: AppModel
    @State private var draft = SymptomCheckInDraft(date: Date())
    @State private var result: SymptomEvaluation?

    var body: some View {
        NavigationStack {
            Form {
                Section("Pain (0 = none, 10 = worst)") {
                    ScorePicker(title: "Resting pain", value: $draft.restingPain)
                    ScorePicker(title: "Walking pain", value: $draft.walkingPain)
                }
                Section("Function") {
                    OptionalPicker("Limp", value: $draft.limp, options: LimpStatus.allCases) { "\($0)".capitalized }
                    OptionalPicker("Swelling", value: $draft.swelling, options: SeverityLevel.allCases) { "\($0)".capitalized }
                    OptionalPicker("Stiffness", value: $draft.stiffness, options: SeverityLevel.allCases) { "\($0)".capitalized }
                    OptionalPicker("New weakness", value: $draft.newWeakness, options: [false, true]) { $0 ? "Yes" : "No" }
                }
                Section("Activity") {
                    OptionalPicker("Activity today (min)", value: $draft.activityDurationMinutes,
                                   options: Array(stride(from: 0, through: 180, by: 5))) { "\($0)" }
                    OptionalPicker("How was the leg the day after yesterday's activity?", value: $draft.nextDayResponse,
                                   options: NextDayResponse.allCases) { "\($0)" }
                }
                Section("Any of these? (urgent)") {
                    ForEach(RedFlag.allCases, id: \.self) { f in
                        Toggle(f.displayName, isOn: Binding(
                            get: { draft.redFlags.contains(f) },
                            set: { if $0 { draft.redFlags.insert(f) } else { draft.redFlags.remove(f) } }))
                    }
                }
                Section { TextField("Notes", text: $draft.notes, axis: .vertical) }
                Button("Save check-in") {
                    draft.date = Date()
                    do {
                        let c = try draft.validated()
                        var eval: SymptomEvaluation?
                        if model.mutate({ eval = $0.addCheckIn(c) }) { result = eval; draft = SymptomCheckInDraft(date: Date()) }
                    } catch { model.errorMessage = String(describing: error) }
                }
                if let r = result {
                    Section { r.level == .stable ? AnyView(Text(r.message)) : AnyView(SymptomBanner(evaluation: r)) }
                }
            }
            .navigationTitle("Daily check-in")
        }
    }
}

struct ScorePicker: View {
    let title: String
    @Binding var value: Int?
    var body: some View {
        Picker(title, selection: $value) {
            Text("—").tag(Int?.none)
            ForEach(0...10, id: \.self) { Text("\($0)").tag(Int?.some($0)) }
        }
    }
}

struct OptionalPicker<T: Hashable>: View {
    let title: String
    @Binding var value: T?
    let options: [T]
    let label: (T) -> String
    init(_ title: String, value: Binding<T?>, options: [T], label: @escaping (T) -> String) {
        self.title = title; self._value = value; self.options = options; self.label = label
    }
    var body: some View {
        Picker(title, selection: $value) {
            Text("—").tag(T?.none)
            ForEach(options, id: \.self) { Text(label($0)).tag(T?.some($0)) }
        }
    }
}
