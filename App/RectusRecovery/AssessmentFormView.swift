import SwiftUI
import RectusRecoveryCore

/// Records what the specialist wrote. Fields left "Not addressed" unlock nothing.
struct AssessmentFormView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    let appointmentID: UUID?

    @State private var clinician = ""
    @State private var role = "Orthopedic surgeon"
    @State private var date = Date()
    @State private var instructions = ""
    @State private var sourceDocID: UUID?
    @State private var tearLocation = ""
    @State private var tendon = ""
    @State private var gap = ""
    @State private var surgery: SurgeryDecision = .notAddressed
    @State private var weightBearing: WeightBearing = .notAddressed
    @State private var wbNotes = ""
    @State private var rom = ""
    @State private var isometrics: [ApprovedExercise] = []
    @State private var newIsoName = ""
    @State private var newIsoDose = ""
    @State private var cycling: CyclingClearance = .notAddressed
    @State private var cyclingConditions = ""
    @State private var strengthRestrictions = ""
    @State private var physioReferral: Bool?
    @State private var hasFollowUp = false
    @State private var followUp = Date()
    @State private var pathway: TreatmentPathway?

    var body: some View {
        Form {
            Section("Who and when (required)") {
                TextField("Clinician name", text: $clinician)
                TextField("Role", text: $role)
                DatePicker("Assessment date", selection: $date, in: ...Date(), displayedComponents: .date)
                Picker("Source document", selection: $sourceDocID) {
                    Text("Choose uploaded letter/report").tag(UUID?.none)
                    ForEach(model.record.documents) { Text($0.title).tag(UUID?.some($0.id)) }
                }
                if model.record.documents.isEmpty {
                    Text("Upload the clinic letter or written restrictions first (Clinical → Documents).").font(.caption).foregroundStyle(.red)
                }
                TextField("Instructions, as written", text: $instructions, axis: .vertical)
            }
            Section("Diagnosis") {
                TextField("Exact anatomical tear location", text: $tearLocation)
                TextField("Tendon involvement", text: $tendon)
                TextField("Retraction or tendon gap", text: $gap)
                Picker("Need for surgery", selection: $surgery) { ForEach(SurgeryDecision.allCases, id: \.self) { Text("\($0)").tag($0) } }
                Picker("Treatment pathway", selection: $pathway) {
                    Text("Not stated").tag(TreatmentPathway?.none)
                    ForEach([TreatmentPathway.conservative, .surgical], id: \.self) { Text("\($0)").tag(TreatmentPathway?.some($0)) }
                }
            }
            Section("Restrictions") {
                Picker("Weight-bearing", selection: $weightBearing) { ForEach(WeightBearing.allCases, id: \.self) { Text("\($0)").tag($0) } }
                TextField("Weight-bearing notes", text: $wbNotes)
                TextField("Approved range of motion", text: $rom, axis: .vertical)
                TextField("Strength-training restrictions", text: $strengthRestrictions, axis: .vertical)
            }
            Section("Approved isometric exercises (exactly as written)") {
                ForEach(isometrics, id: \.self) { Text("\($0.name) — \($0.parameters)") }
                    .onDelete { isometrics.remove(atOffsets: $0) }
                TextField("Exercise", text: $newIsoName)
                TextField("Dose (sets, holds, effort)", text: $newIsoDose)
                Button("Add exercise") {
                    isometrics.append(ApprovedExercise(name: newIsoName, parameters: newIsoDose))
                    newIsoName = ""; newIsoDose = ""
                }.disabled(newIsoName.isEmpty || newIsoDose.isEmpty)
            }
            Section("Cycling") {
                Picker("Clearance", selection: $cycling) { ForEach(CyclingClearance.allCases, id: \.self) { Text("\($0)").tag($0) } }
                TextField("Conditions (seat height, resistance, minutes)", text: $cyclingConditions)
            }
            Section("Next steps") {
                Picker("Physiotherapy referral", selection: $physioReferral) {
                    Text("Not stated").tag(Bool?.none); Text("Yes").tag(Bool?.some(true)); Text("No").tag(Bool?.some(false))
                }
                Toggle("Follow-up booked", isOn: $hasFollowUp)
                if hasFollowUp { DatePicker("Follow-up", selection: $followUp) }
            }
            Button("Save findings") { save() }
                .disabled(clinician.trimmingCharacters(in: .whitespaces).isEmpty || sourceDocID == nil)
        }
        .navigationTitle("Specialist findings")
    }

    func opt(_ s: String) -> String? { s.isEmpty ? nil : s }

    func save() {
        guard let doc = sourceDocID else { return }
        let a = OrthopedicAssessment(
            attestation: ClinicianAttestation(clinicianName: clinician, role: role, assessmentDate: date,
                                              instructions: instructions, sourceDocumentID: doc),
            tearLocation: opt(tearLocation), tendonInvolvement: opt(tendon), retractionOrGap: opt(gap),
            surgery: surgery, weightBearing: weightBearing, weightBearingNotes: opt(wbNotes),
            approvedRangeOfMotion: opt(rom), approvedIsometrics: isometrics, cyclingClearance: cycling,
            cyclingConditions: opt(cyclingConditions), strengthTrainingRestrictions: opt(strengthRestrictions),
            physiotherapyReferral: physioReferral, followUpDate: hasFollowUp ? followUp : nil, treatmentPathway: pathway)
        if model.mutate({ try $0.recordOrthopedicAssessment(a, now: Date()) }) { dismiss() }
    }
}
