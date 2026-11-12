import SwiftUI
import UniformTypeIdentifiers
import RectusRecoveryCore

struct ClinicalView: View {
    @EnvironmentObject var model: AppModel
    @State private var importing = false
    @State private var importKind: DocumentKind = .mriReport

    var body: some View {
        NavigationStack {
            List {
                Section("Profile") {
                    Text(model.record.profile.diagnosis)
                    Text(model.record.profile.imagingSummary).foregroundStyle(.secondary)
                    LabeledContent("Injury date", value: model.record.profile.injuryDate.formatted(date: .long, time: .omitted))
                    LabeledContent("Orthopedics", value: "\(model.record.profile.orthopedicStatus)")
                    LabeledContent("Physiotherapy", value: "\(model.record.profile.physiotherapyStatus)")
                    LabeledContent("Treatment pathway", value: "\(model.record.profile.treatmentPathway)")
                    LabeledContent("Kettlebells", value: model.record.profile.availableKettlebellsKg.map { "\(Int($0))" }.joined(separator: ", ") + " kg")
                }
                Section("Appointments") {
                    ForEach(model.record.appointments) { a in
                        NavigationLink { AppointmentDetailView(appointmentID: a.id) } label: {
                            VStack(alignment: .leading) {
                                Text(a.title)
                                Text(a.scheduledAt?.formatted() ?? "Not booked — tap to add date").font(.caption)
                            }
                        }
                    }
                    Button("Add appointment") {
                        model.mutate { $0.addAppointment(Appointment(kind: .other, title: "Appointment", scheduledAt: nil)) }
                    }
                }
                Section("Orthopedic assessments") {
                    ForEach(model.record.orthopedicAssessments) { a in
                        VStack(alignment: .leading) {
                            Text("\(a.attestation.clinicianName) · \(a.attestation.assessmentDate.formatted(date: .abbreviated, time: .omitted))")
                            Text(a.attestation.instructions).font(.caption)
                            if model.record.restrictionsReviewed[a.id] == nil {
                                Button("I have read the written restrictions") {
                                    model.mutate { $0.markRestrictionsReviewed(assessmentID: a.id, at: Date()) }
                                }
                            }
                        }
                    }
                    NavigationLink("Enter specialist findings") { AssessmentFormView(appointmentID: nil) }
                }
                Section("Clinician authorizations") {
                    if model.record.authorizations.isEmpty { Text("None documented. Restricted activities stay locked.") }
                    ForEach(model.record.authorizations) { a in
                        VStack(alignment: .leading) {
                            Text(a.category.displayName).bold()
                            ForEach(a.approvedExercises, id: \.self) { Text("\($0.name) — \($0.parameters)").font(.caption) }
                            Text("By \(a.attestation.clinicianName), \(a.attestation.assessmentDate.formatted(date: .abbreviated, time: .omitted))\(a.revokedOn != nil ? " · REVOKED" : "")")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                Section("Documents (MRI reports, letters)") {
                    ForEach(model.record.documents) { d in
                        LabeledContent(d.title, value: d.documentDate.formatted(date: .abbreviated, time: .omitted))
                    }
                    Picker("Type", selection: $importKind) {
                        ForEach(DocumentKind.allCases, id: \.self) { Text("\($0)").tag($0) }
                    }
                    Button("Upload document") { importing = true }
                }
                Section { SafetyFooter() }
            }
            .navigationTitle("Clinical")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .image, .plainText]) { result in
                if case .success(let url) = result {
                    _ = model.importDocument(from: url, kind: importKind, title: url.deletingPathExtension().lastPathComponent, date: Date())
                }
            }
        }
    }
}

struct AppointmentDetailView: View {
    @EnvironmentObject var model: AppModel
    let appointmentID: UUID

    var body: some View {
        if let a = model.record.appointments.first(where: { $0.id == appointmentID }) {
            Form {
                TextField("Title", text: bind(a, \.title))
                DatePicker("Date", selection: Binding(get: { a.scheduledAt ?? Date() },
                                                      set: { v in update(a) { $0.scheduledAt = v } }))
                TextField("Clinician", text: Binding(get: { a.clinicianName ?? "" }, set: { v in update(a) { $0.clinicianName = v } }))
                Section("Question checklist — bring this") {
                    ForEach(a.questions) { q in
                        VStack(alignment: .leading) {
                            Text(q.question)
                            TextField("Answer", text: Binding(get: { q.answer ?? "" }, set: { v in
                                update(a) { appt in
                                    if let i = appt.questions.firstIndex(where: { $0.id == q.id }) { appt.questions[i].answer = v }
                                }
                            }), axis: .vertical).font(.caption)
                        }
                    }
                }
                if a.needsFindings(now: Date()) {
                    NavigationLink("Enter findings now") { AssessmentFormView(appointmentID: a.id) }
                }
            }
            .navigationTitle(a.title)
        }
    }

    func update(_ a: Appointment, _ change: (inout Appointment) -> Void) {
        var copy = a
        change(&copy)
        model.mutate { $0.updateAppointment(copy) }
    }

    func bind(_ a: Appointment, _ kp: WritableKeyPath<Appointment, String>) -> Binding<String> {
        Binding(get: { a[keyPath: kp] }, set: { v in update(a) { $0[keyPath: kp] = v } })
    }
}
