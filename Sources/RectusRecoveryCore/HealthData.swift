import Foundation

// MARK: - Imported Apple Health data
// This store is performance data only. Nothing here is read by AccessEngine,
// and nothing here can create an authorization, a phase change, a
// prerequisite completion, or a functional assessment.

public enum HealthMetric: String, Codable, CaseIterable, Sendable {
    case steps, walkingRunningDistance, cyclingDistance, workout, heartRate, restingHeartRate, sleep

    public var displayName: String {
        switch self {
        case .steps: return "Steps"
        case .walkingRunningDistance: return "Walking + running distance"
        case .cyclingDistance: return "Cycling distance"
        case .workout: return "Workouts"
        case .heartRate: return "Heart rate"
        case .restingHeartRate: return "Resting heart rate"
        case .sleep: return "Sleep"
        }
    }
}

/// HealthKit never reveals whether *read* access was denied. The app can only
/// know whether it asked, and whether data is arriving.
public enum HealthPermissionState: String, Codable, Sendable {
    case notRequested, requested, healthDataUnavailable
}

public struct HealthSample: Codable, Equatable, Identifiable, Sendable {
    /// HealthKit sample UUID.
    public var id: UUID
    public var metric: HealthMetric
    public var start: Date
    public var end: Date
    /// Count, metres, bpm, or minutes asleep depending on metric. Workouts: distance in metres (0 if none).
    public var value: Double
    public var unit: String
    public var workoutActivity: String?
    public var durationSeconds: Double?
    public var sourceBundleID: String
    public var sourceName: String

    public init(id: UUID, metric: HealthMetric, start: Date, end: Date, value: Double, unit: String,
                workoutActivity: String? = nil, durationSeconds: Double? = nil,
                sourceBundleID: String, sourceName: String) {
        self.id = id
        self.metric = metric
        self.start = start
        self.end = end
        self.value = value
        self.unit = unit
        self.workoutActivity = workoutActivity
        self.durationSeconds = durationSeconds
        self.sourceBundleID = sourceBundleID
        self.sourceName = sourceName
    }
}

public struct HealthImportReport: Equatable, Sendable {
    public var added = 0
    public var duplicatesSkipped = 0
    public var deleted = 0
}

public struct HealthDataStore: Codable, Equatable, Sendable {
    public private(set) var samples: [UUID: HealthSample] = [:]
    /// Opaque HKQueryAnchor archives so imports resume after offline periods.
    public var anchors: [HealthMetric: Data] = [:]
    public var permission: HealthPermissionState = .notRequested
    public var lastSyncAt: [HealthMetric: Date] = [:]

    public init() {}

    /// Idempotent. Re-delivered samples (same UUID), exact duplicates from
    /// another source, and overlapping copies of the same workout (e.g. Watch
    /// and a third-party app) are skipped.
    @discardableResult
    public mutating func ingest(metric: HealthMetric, added: [HealthSample], deletedIDs: [UUID],
                                newAnchor: Data?, at now: Date) -> HealthImportReport {
        var report = HealthImportReport()
        for id in deletedIDs where samples.removeValue(forKey: id) != nil { report.deleted += 1 }
        for s in added {
            if samples[s.id] != nil || isDuplicate(s) { report.duplicatesSkipped += 1; continue }
            samples[s.id] = s
            report.added += 1
        }
        if let a = newAnchor { anchors[metric] = a }
        lastSyncAt[metric] = now
        return report
    }

    private func isDuplicate(_ s: HealthSample) -> Bool {
        samples.values.contains { o in
            guard o.metric == s.metric else { return false }
            if o.start == s.start && o.end == s.end && o.value == s.value && o.workoutActivity == s.workoutActivity {
                return true
            }
            guard s.metric == .workout, o.workoutActivity == s.workoutActivity else { return false }
            let overlap = min(o.end, s.end).timeIntervalSince(max(o.start, s.start))
            let shorter = min(o.end.timeIntervalSince(o.start), s.end.timeIntervalSince(s.start))
            return shorter > 0 && overlap / shorter >= 0.8
        }
    }

    public func samples(_ metric: HealthMetric, in range: Range<Date>) -> [HealthSample] {
        samples.values.filter { $0.metric == metric && range.contains($0.start) }.sorted { $0.start < $1.start }
    }

    /// nil means "no data", which is never treated as zero activity.
    /// The iOS app should prefer HKStatisticsCollectionQuery for steps and
    /// distance, which already merges iPhone + Watch overlap.
    public func dailyTotal(_ metric: HealthMetric, day: Date, calendar: Calendar) -> Double? {
        let start = calendar.startOfDay(for: day)
        let end = calendar.date(byAdding: .day, value: 1, to: start)!
        let xs = samples(metric, in: start..<end)
        return xs.isEmpty ? nil : xs.map(\.value).reduce(0, +)
    }

    /// Metrics with no new data for `days` — shown as "No recent data", not as inactivity.
    public func staleMetrics(now: Date, days: Double = 3) -> [HealthMetric] {
        HealthMetric.allCases.filter { m in
            guard let last = lastSyncAt[m] else { return true }
            return now.timeIntervalSince(last) > days * 86_400
        }
    }
}
