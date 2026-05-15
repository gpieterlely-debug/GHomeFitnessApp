import React, { useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, Share, Platform,
  TextInput, Switch,
} from 'react-native';
import { useWorkoutStore } from '../store/workoutStore';
import { colors, spacing, typography, radius } from '../theme';
import {
  requestHealthKitAuthorization,
  fetchHealthKitWorkouts,
} from '../integrations/healthkit';
import { stravaAuthorize, stravaDisconnect, fetchStravaActivities } from '../integrations/strava';
import { garminDisconnect } from '../integrations/garmin';
import { wahooAuthorize, wahooDisconnect, fetchWahooWorkouts } from '../integrations/wahoo';
import {
  requestNotificationPermission,
  scheduleSessionReminders,
  cancelAllScheduledNotifications,
  sendTestNotification,
} from '../utils/notifications';

// ─── Integration Card ─────────────────────────────────────────────────────────

interface IntegrationCardProps {
  name: string;
  description: string;
  connected: boolean;
  lastSynced?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync?: () => void;
  note?: string;
  accentColor?: string;
}

function IntegrationCard({ name, description, connected, lastSynced, onConnect, onDisconnect, onSync, note, accentColor }: IntegrationCardProps) {
  const color = accentColor || colors.accent;
  return (
    <View style={[styles.integrationCard, connected && { borderColor: color + '66' }]}>
      <View style={styles.integrationHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.integrationName}>{name}</Text>
          <Text style={styles.integrationDesc}>{description}</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: connected ? colors.accent : colors.line }]} />
      </View>
      {lastSynced && <Text style={styles.lastSynced}>Last synced: {lastSynced.slice(0, 10)}</Text>}
      <View style={styles.integrationBtns}>
        {connected ? (
          <>
            {onSync && (
              <TouchableOpacity style={[styles.btn, { borderColor: color }]} onPress={onSync}>
                <Text style={[styles.btnText, { color }]}>Sync now</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btnSecondary} onPress={onDisconnect}>
              <Text style={styles.btnSecondaryText}>Disconnect</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.btn, { borderColor: color }]} onPress={onConnect}>
            <Text style={[styles.btnText, { color }]}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>
      {note ? <Text style={styles.integrationNote}>{note}</Text> : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const integrations = useWorkoutStore(s => s.integrations);
  const settings = useWorkoutStore(s => s.settings);
  const setIntegrationStatus = useWorkoutStore(s => s.setIntegrationStatus);
  const upsertFromIntegration = useWorkoutStore(s => s.upsertFromIntegration);
  const updateSettings = useWorkoutStore(s => s.updateSettings);
  const logs = useWorkoutStore(s => s.logs);

  const [syncing, setSyncing] = useState<string | null>(null);
  const [notifTime, setNotifTime] = useState(
    `${String(settings.notificationHour).padStart(2, '0')}:${String(settings.notificationMinute).padStart(2, '0')}`
  );

  // ── HealthKit ──
  async function handleHealthKitConnect() {
    if (Platform.OS !== 'ios') { Alert.alert('iOS only', 'HealthKit requires iPhone / Apple Watch.'); return; }
    const ok = await requestHealthKitAuthorization();
    if (ok) {
      await setIntegrationStatus('healthkit', { connected: true, lastSynced: new Date().toISOString() });
      await handleHealthKitSync();
    } else {
      Alert.alert('Permission denied', 'Allow Health access in iOS Settings → Privacy → Health.');
    }
  }

  async function handleHealthKitSync() {
    setSyncing('healthkit');
    try {
      const hkLogs = await fetchHealthKitWorkouts(60);
      const added = await upsertFromIntegration(hkLogs);
      await setIntegrationStatus('healthkit', { lastSynced: new Date().toISOString() });
      Alert.alert('HealthKit sync', `${hkLogs.length} workouts found, ${added} new.`);
    } finally { setSyncing(null); }
  }

  // ── Strava ──
  async function handleStravaConnect() {
    try {
      const tokens = await stravaAuthorize();
      if (tokens) {
        await setIntegrationStatus('strava', { connected: true, accessToken: tokens.accessToken, athleteId: tokens.athleteId });
        await handleStravaSync();
      }
    } catch (e: unknown) {
      Alert.alert('Strava', e instanceof Error ? e.message : 'Connection failed. Set clientId in config.ts.');
    }
  }

  async function handleStravaSync() {
    setSyncing('strava');
    try {
      const activities = await fetchStravaActivities(60);
      const added = await upsertFromIntegration(activities);
      await setIntegrationStatus('strava', { lastSynced: new Date().toISOString() });
      Alert.alert('Strava sync', `${activities.length} activities found, ${added} new.`);
    } finally { setSyncing(null); }
  }

  // ── Wahoo ──
  async function handleWahooConnect() {
    try {
      const tokens = await wahooAuthorize();
      if (tokens) {
        await setIntegrationStatus('wahoo', { connected: true, accessToken: tokens.accessToken });
        await handleWahooSync();
      }
    } catch (e: unknown) {
      Alert.alert('Wahoo', e instanceof Error ? e.message : 'Connection failed.');
    }
  }

  async function handleWahooSync() {
    setSyncing('wahoo');
    try {
      const workouts = await fetchWahooWorkouts(60);
      const added = await upsertFromIntegration(workouts);
      await setIntegrationStatus('wahoo', { lastSynced: new Date().toISOString() });
      Alert.alert('Wahoo sync', `${workouts.length} workouts found, ${added} new.`);
    } finally { setSyncing(null); }
  }

  // ── Notifications ──
  async function handleNotificationToggle(enabled: boolean) {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('Permission required', 'Enable notifications in iOS Settings → Notifications → GHome Fitness.');
        return;
      }
      if (!settings.planStartDate) {
        Alert.alert('Set plan start date first', 'Enter your plan start date so we can schedule the right sessions.');
        return;
      }
      await updateSettings({ notificationsEnabled: true });
      const [h, m] = notifTime.split(':').map(Number);
      await scheduleSessionReminders(settings.planStartDate, h, m);
    } else {
      await cancelAllScheduledNotifications();
      await updateSettings({ notificationsEnabled: false });
    }
  }

  async function handleNotificationTimeChange(val: string) {
    setNotifTime(val);
    if (/^\d{2}:\d{2}$/.test(val)) {
      const [h, m] = val.split(':').map(Number);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        await updateSettings({ notificationHour: h, notificationMinute: m });
        if (settings.notificationsEnabled && settings.planStartDate) {
          await scheduleSessionReminders(settings.planStartDate, h, m);
        }
      }
    }
  }

  async function handlePlanStartDateChange(val: string) {
    await updateSettings({ planStartDate: val || null });
    if (settings.notificationsEnabled && val) {
      await scheduleSessionReminders(val, settings.notificationHour, settings.notificationMinute);
    }
  }

  async function handleTestNotification() {
    if (!settings.planStartDate) { Alert.alert('Set plan start date first.'); return; }
    await sendTestNotification("Today's session", 'Test notification — arrives in 3 seconds.');
    Alert.alert('Test sent', 'Notification arrives in ~3 seconds.');
  }

  async function handleExportJSON() {
    const json = JSON.stringify(logs, null, 2);
    await Share.share({ message: json, title: 'GHome Fitness — workout logs' });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Connect & Settings</Text>
      <Text style={styles.subtitle}>Integrations, race planning, and notifications.</Text>

      {/* ── Plan Setup ─────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Plan setup</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Plan start date (Week 1 began)</Text>
        <TextInput
          style={styles.input}
          value={settings.planStartDate || ''}
          onChangeText={handlePlanStartDateChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <Text style={styles.fieldHint}>Sets the calendar anchor for all plan weeks and TSS compliance tracking.</Text>

        <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>A-Race date</Text>
        <TextInput
          style={styles.input}
          value={settings.raceDate || ''}
          onChangeText={v => updateSettings({ raceDate: v || null })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <Text style={styles.fieldHint}>
          Enables taper: 2 weeks out → 85% volume, 1 week out → 70%, race week → 50%.
        </Text>
        {settings.raceDate && settings.planStartDate && <RaceCountdown raceDate={settings.raceDate} planStartDate={settings.planStartDate} />}
      </View>

      {/* ── Notifications ──────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Session reminders</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Daily session reminder</Text>
            <Text style={styles.fieldHint}>Notifies you each morning with today's planned session.</Text>
          </View>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={handleNotificationToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor="white"
          />
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Reminder time (24h HH:MM)</Text>
        <TextInput
          style={styles.input}
          value={notifTime}
          onChangeText={handleNotificationTimeChange}
          placeholder="07:00"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />

        <TouchableOpacity style={[styles.btnSecondary, { marginTop: spacing.sm }]} onPress={handleTestNotification}>
          <Text style={styles.btnSecondaryText}>Send test notification</Text>
        </TouchableOpacity>
        <Text style={styles.fieldHint}>Schedules 28 days of reminders from today. Re-runs when you change plan start date or time.</Text>
      </View>

      {/* ── Integrations ───────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Integrations</Text>

      <IntegrationCard
        name="Apple Health / HealthKit"
        description="Read workouts, heart rate, HRV, distance from iPhone & Apple Watch."
        connected={integrations.healthkit.connected}
        lastSynced={integrations.healthkit.lastSynced}
        onConnect={handleHealthKitConnect}
        onDisconnect={() => setIntegrationStatus('healthkit', { connected: false })}
        onSync={handleHealthKitSync}
        note={syncing === 'healthkit' ? 'Syncing…' : 'iOS only · HealthKit entitlement required (set in app.json)'}
        accentColor={colors.accent}
      />

      <IntegrationCard
        name="Strava"
        description="OAuth 2.0 · Pulls rides and runs. Set clientId + clientSecret in src/integrations/config.ts."
        connected={integrations.strava.connected}
        lastSynced={integrations.strava.lastSynced}
        onConnect={handleStravaConnect}
        onDisconnect={async () => { await stravaDisconnect(); await setIntegrationStatus('strava', { connected: false, accessToken: undefined, athleteId: undefined }); }}
        onSync={handleStravaSync}
        note={syncing === 'strava' ? 'Syncing…' : 'strava.com/settings/api → create app → copy credentials to config.ts'}
        accentColor="#FC4C02"
      />

      <IntegrationCard
        name="Garmin Connect"
        description="OAuth 1.0a · Activities, power, HRV, body battery from Garmin devices."
        connected={integrations.garmin.connected}
        lastSynced={integrations.garmin.lastSynced}
        onConnect={() => Alert.alert('Garmin Connect', 'OAuth 1.0a requires a backend proxy for HMAC signing.\n\nRegister at developer.garmin.com, build a small proxy server, then wire in the tokens via saveGarminTokens() in garmin.ts.')}
        onDisconnect={async () => { await garminDisconnect(); await setIntegrationStatus('garmin', { connected: false }); }}
        note="Requires backend proxy — see src/integrations/garmin.ts for architecture."
        accentColor="#00A3E0"
      />

      <IntegrationCard
        name="Wahoo SYSTM"
        description="OAuth 2.0 · Indoor cycling, structured workouts, power data."
        connected={integrations.wahoo.connected}
        lastSynced={integrations.wahoo.lastSynced}
        onConnect={handleWahooConnect}
        onDisconnect={async () => { await wahooDisconnect(); await setIntegrationStatus('wahoo', { connected: false }); }}
        onSync={integrations.wahoo.connected ? handleWahooSync : undefined}
        note={syncing === 'wahoo' ? 'Syncing…' : 'developer.wahooligan.com → register → set clientId in config.ts'}
        accentColor="#E4002B"
      />

      {/* ── Architecture reference ──────────────────────────────── */}
      <Text style={styles.sectionTitle}>Integration architecture</Text>
      <View style={styles.card}>
        {[
          ['Apple Health Adapter', 'react-native-health', 'HealthKit permissions → read workouts, HR, HRV; TSS auto-computed from RPE'],
          ['Strava OAuth Service', 'expo-auth-session PKCE', 'Browser code exchange → tokens in SecureStore; refresh on expiry'],
          ['Garmin Connect', 'Backend OAuth 1.0a proxy', 'HMAC-SHA1 signing server-side; proxy returns normalized activities'],
          ['Wahoo SYSTM', 'expo-auth-session PKCE', 'OAuth 2.0 → workouts API; de-dup via externalId'],
          ['TSS Engine', 'calcActualTSS (data/plan.ts)', 'RPE-based IF → TSS = (min/60) × IF² × 100; planned TSS from sessionIF'],
          ['Race Block', 'getRaceWeekStatus', 'planStartDate + raceDate → weeksToRace → taper multiplier per week'],
        ].map(([module, tech, purpose]) => (
          <View key={module} style={styles.archRow}>
            <Text style={styles.archModule}>{module}</Text>
            <Text style={styles.archTech}>{tech}</Text>
            <Text style={styles.archPurpose}>{purpose}</Text>
          </View>
        ))}
      </View>

      {/* ── Data ───────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Data</Text>
      <View style={styles.card}>
        <Text style={styles.dataInfo}>{logs.length} workouts · {logs.reduce((s, l) => s + (l.tss || 0), 0)} total TSS</Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleExportJSON}>
          <Text style={styles.btnPrimaryText}>Export JSON</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function RaceCountdown({ raceDate, planStartDate }: { raceDate: string; planStartDate: string }) {
  const msToRace = new Date(raceDate).getTime() - Date.now();
  const daysToRace = Math.ceil(msToRace / 86400000);
  if (daysToRace < 0) return null;
  const msSinceStart = Date.now() - new Date(planStartDate).getTime();
  const currentWeek = Math.min(24, Math.max(1, Math.floor(msSinceStart / (7 * 86400000)) + 1));
  const weeksLeft = Math.max(0, 24 - currentWeek);
  return (
    <View style={styles.raceCountdown}>
      <Text style={styles.raceCountdownText}>
        🏁 {daysToRace} day{daysToRace !== 1 ? 's' : ''} to race · Week {currentWeek} of 24 · {weeksLeft} week{weeksLeft !== 1 ? 's' : ''} of plan left
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  title: { fontSize: typography.xl, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: typography.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: typography.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  fieldLabel: { color: colors.muted, fontSize: typography.sm, marginBottom: 4 },
  fieldHint: { color: colors.muted, fontSize: typography.xs, marginTop: 4, fontStyle: 'italic' },
  input: {
    backgroundColor: colors.inputBg, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.line, color: colors.text, padding: 10, fontSize: typography.base,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchLabel: { color: colors.text, fontSize: typography.base, fontWeight: '600' },
  raceCountdown: { marginTop: spacing.sm, backgroundColor: colors.danger + '11', borderRadius: radius.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.danger + '44' },
  raceCountdownText: { color: colors.danger, fontSize: typography.sm, fontWeight: '600' },
  integrationCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  integrationHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  integrationName: { fontSize: typography.base, fontWeight: '700', color: colors.text },
  integrationDesc: { color: colors.muted, fontSize: typography.sm, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  lastSynced: { color: colors.muted, fontSize: typography.xs, marginBottom: spacing.sm },
  integrationBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, backgroundColor: 'transparent' },
  btnText: { fontWeight: '700', fontSize: typography.sm },
  btnSecondary: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: '#1e293b' },
  btnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: typography.sm },
  integrationNote: { color: colors.muted, fontSize: typography.xs, marginTop: 8, fontStyle: 'italic' },
  archRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  archModule: { color: colors.text, fontSize: typography.sm, fontWeight: '600' },
  archTech: { color: colors.accent2, fontSize: typography.xs, marginTop: 2 },
  archPurpose: { color: colors.muted, fontSize: typography.xs, marginTop: 1 },
  dataInfo: { color: colors.text, fontSize: typography.sm, marginBottom: spacing.sm },
  btnPrimary: { backgroundColor: colors.accent, padding: 11, borderRadius: radius.sm, alignItems: 'center' },
  btnPrimaryText: { color: colors.accentDark, fontWeight: '700', fontSize: typography.sm },
});
