import SwiftUI
import RectusRecoveryCore

/// Thin UI wrapper. Every rule lives in RectusRecoveryCore (tested);
/// this class only loads, mutates, saves, and reschedules reminders.
@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var record: RecoveryRecord
    @Published var errorMessage: String?

    let calendar = Calendar.current
    let documentsFolder: URL
    private let store: RecordStore

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        documentsFolder = support.appendingPathComponent("ClinicalDocuments", isDirectory: true)
        try? FileManager.default.createDirectory(at: documentsFolder, withIntermediateDirectories: true)
        store = RecordStore(url: support.appendingPathComponent("recovery-record.json"))
        do {
            record = try store.loadOrSeed(calendar: Calendar.current)
        } catch {
            // Never silently replace clinical history: keep the bad file, start read-only seed in memory.
            record = ClinicalConfiguration.initialRecord(calendar: Calendar.current)
            errorMessage = "Could not read saved record (\(error)). Your file was not overwritten."
        }
    }

    var now: Date { Date() }
    var dashboard: DashboardState { record.dashboard(at: now, calendar: calendar) }

    /// All writes go through here: apply → save → reschedule reminders.
    @discardableResult
    func mutate(_ change: (inout RecoveryRecord) throws -> Void) -> Bool {
        var copy = record
        do {
            try change(&copy)
            try store.save(copy)
            record = copy
            Task { await NotificationScheduler.sync(appointments: copy.appointments, now: Date()) }
            return true
        } catch {
            errorMessage = String(describing: error)
            return false
        }
    }

    func importDocument(from url: URL, kind: DocumentKind, title: String, date: Date) -> ClinicalDocument? {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let name = "\(UUID().uuidString)-\(url.lastPathComponent)"
        do {
            try FileManager.default.copyItem(at: url, to: documentsFolder.appendingPathComponent(name))
        } catch {
            errorMessage = "Could not store document: \(error.localizedDescription)"
            return nil
        }
        let doc = ClinicalDocument(kind: kind, title: title, documentDate: date, storedFileName: name, addedAt: now)
        return mutate { $0.addDocument(doc) } ? doc : nil
    }
}
