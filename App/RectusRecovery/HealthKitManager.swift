import Foundation
import HealthKit
import RectusRecoveryCore

/// Read-only HealthKit import. Writes only to RecoveryRecord.health via
/// importHealth(...), which has no clinical side effects (see AcceptanceTests.test06).
@MainActor
final class HealthKitManager: ObservableObject {
    enum Status { case unavailable, notRequested, connected }

    @Published private(set) var status: Status
    private let store = HKHealthStore()

    init() {
        status = HKHealthStore.isHealthDataAvailable() ? .notRequested : .unavailable
    }

    private static let quantityTypes: [(HealthMetric, HKQuantityTypeIdentifier, HKUnit)] = [
        (.steps, .stepCount, .count()),
        (.walkingRunningDistance, .distanceWalkingRunning, .meter()),
        (.cyclingDistance, .distanceCycling, .meter()),
        (.heartRate, .heartRate, HKUnit.count().unitDivided(by: .minute())),
        (.restingHeartRate, .restingHeartRate, HKUnit.count().unitDivided(by: .minute())),
    ]

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = Set(Self.quantityTypes.map { HKQuantityType($0.1) })
        s.insert(HKObjectType.workoutType())
        s.insert(HKCategoryType(.sleepAnalysis))
        return s
    }

    func requestAndSync(model: AppModel) async {
        guard status != .unavailable else { return }
        do {
            // HealthKit never says whether read access was denied; denied types simply return no data.
            try await store.requestAuthorization(toShare: [], read: readTypes)
            status = .connected
            model.mutate { $0.health.permission = .requested }
        } catch {
            model.errorMessage = "Apple Health: \(error.localizedDescription)"
            return
        }
        for (metric, id, unit) in Self.quantityTypes {
            await sync(metric: metric, type: HKQuantityType(id), model: model) { s in
                guard let q = s as? HKQuantitySample else { return nil }
                return Self.sample(s, metric: metric, value: q.quantity.doubleValue(for: unit), unit: unit.unitString)
            }
        }
        await sync(metric: .workout, type: .workoutType(), model: model) { s in
            guard let w = s as? HKWorkout else { return nil }
            let km = w.statistics(for: HKQuantityType(.distanceCycling))?.sumQuantity()
                ?? w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()
            var out = Self.sample(s, metric: .workout, value: km?.doubleValue(for: .meter()) ?? 0, unit: "m")
            out.workoutActivity = Self.name(w.workoutActivityType)
            out.durationSeconds = w.duration
            return out
        }
        await sync(metric: .sleep, type: HKCategoryType(.sleepAnalysis), model: model) { s in
            guard let c = s as? HKCategorySample,
                  HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue).contains(c.value) else { return nil }
            return Self.sample(s, metric: .sleep, value: c.endDate.timeIntervalSince(c.startDate) / 60, unit: "min")
        }
    }

    /// Anchored query: resumes where it left off after offline periods and
    /// reports deletions, so edits in the Health app are mirrored.
    private func sync(metric: HealthMetric, type: HKSampleType, model: AppModel,
                      map: @escaping (HKSample) -> HealthSample?) async {
        let anchor = model.record.health.anchors[metric].flatMap {
            try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0)
        }
        let start = model.record.profile.injuryDate.addingTimeInterval(-30 * 86_400)
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.sample(type: type, predicate: HKQuery.predicateForSamples(withStart: start, end: nil))],
            anchor: anchor)
        do {
            let result = try await descriptor.result(for: store)
            let added = result.addedSamples.compactMap(map)
            let deleted = result.deletedObjects.map(\.uuid)
            let newAnchor = try? NSKeyedArchiver.archivedData(withRootObject: result.newAnchor, requiringSecureCoding: true)
            model.mutate { $0.importHealth(metric: metric, added: added, deletedIDs: deleted, newAnchor: newAnchor, at: Date()) }
        } catch {
            // Offline/locked device/permission change: keep existing data, try next time.
        }
    }

    private static func sample(_ s: HKSample, metric: HealthMetric, value: Double, unit: String) -> HealthSample {
        HealthSample(id: s.uuid, metric: metric, start: s.startDate, end: s.endDate, value: value, unit: unit,
                     sourceBundleID: s.sourceRevision.source.bundleIdentifier, sourceName: s.sourceRevision.source.name)
    }

    private static func name(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .cycling: return "cycling"
        case .running: return "running"
        case .walking: return "walking"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength"
        case .soccer: return "soccer"
        default: return "other"
        }
    }
}
