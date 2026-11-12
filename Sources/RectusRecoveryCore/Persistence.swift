import Foundation

/// Local, offline-first JSON store. No network is needed for any feature.
public struct RecordStore: Sendable {
    public let url: URL

    public init(url: URL) { self.url = url }

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    public func load() throws -> RecoveryRecord? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try Self.decoder.decode(RecoveryRecord.self, from: Data(contentsOf: url))
    }

    public func save(_ record: RecoveryRecord) throws {
        let data = try Self.encoder.encode(record)
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: url, options: [.atomic])
        #endif
    }

    /// Loads the existing record, or seeds v2.1 on first launch.
    public func loadOrSeed(calendar: Calendar) throws -> RecoveryRecord {
        if let r = try load() { return r }
        let r = ClinicalConfiguration.initialRecord(calendar: calendar)
        try save(r)
        return r
    }
}
