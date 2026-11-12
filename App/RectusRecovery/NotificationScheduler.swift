import Foundation
import UserNotifications
import RectusRecoveryCore

/// Local notifications only: appointment reminders, findings prompts, daily check-in.
enum NotificationScheduler {
    static let checkInID = "daily-check-in"

    static func requestAuthorization() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        await scheduleDailyCheckIn()
    }

    static func scheduleDailyCheckIn(hour: Int = 20) async {
        let content = UNMutableNotificationContent()
        content.title = "Daily symptom check-in"
        content.body = "Two minutes: pain, limp, swelling, and how the leg felt after yesterday."
        let trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: hour), repeats: true)
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: checkInID, content: content, trigger: trigger))
    }

    static func sync(appointments: [Appointment], now: Date) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0 != checkInID }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        for r in ReminderPlanner.reminders(for: appointments, now: now) {
            let content = UNMutableNotificationContent()
            content.title = r.title
            content.body = r.body
            let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: r.fireDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: r.identifier, content: content, trigger: trigger))
        }
    }
}
