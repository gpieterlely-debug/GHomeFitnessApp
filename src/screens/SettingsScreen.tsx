import React, { useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, Share, Platform,
} from 'react-native';
import { useWorkoutStore } from '../store/workoutStore';
import { colors, spacing, typography, radius } from '../theme';
import {
  requestHealthKitAuthorization,
  fetchHealthKitWorkouts,
} from '../integrations/healthkit';
import { stravaAuthorize, stravaDisconnect, fetchStravaActivities } from '../integrations/strava';
import { getGarminConnectionStatus, garminDisconnect } from '../integrations/garmin';
import { wahooAuthorize, wahooDisconnect, fetchWahooWorkouts } from '../integrations/wahoo';

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

function IntegrationCard({
  name, description, connected, lastSynced, onConnect, onDisconnect, onSync, note, accentColor,
}: IntegrationCardProps) {
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
      {lastSynced && <Text style={styles.lastSynced}>Last synced: {lastSynced}</Text>}
      <View style={styles.integrationBtns}>
        {connected ? (
          <>
            {onSync && (
              <TouchableOpacity style={[styles.btn, styles.btnAccent, { borderColor: color }]} onPress={onSync}>
                <Text style={[styles.btnText, { color }]}>Sync now</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btnSecondary} onPress={onDisconnect}>
              <Text style={styles.btnSecondaryText}>Disconnect</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnAccent, { borderColor: color }]} onPress={onConnect}>
            <Text style={[styles.btnText, { color }]}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>
      {note && <Text style={styles.integrationNote}>{note}</Text>}
    </View>
  );
}

export function SettingsScreen() {
  const integrations = useWorkoutStore(s => s.integrations);
  const setIntegrationStatus = useWorkoutStore(s => s.setIntegrationStatus);
  const upsertFromIntegration = useWorkoutStore(s => s.upsertFromIntegration);
  const logs = useWorkoutStore(s => s.logs);
  const [syncing, setSyncing] = useState<string | null>(null);

  async function handleHealthKitConnect() {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'Apple HealthKit requires an iPhone or Apple Watch.');
      return;
    }
    const ok = await requestHealthKitAuthorization();
    if (ok) {
      await setIntegrationStatus('healthkit', { connected: true, lastSynced: new Date().toISOString() });
      await handleHealthKitSync();
    } else {
      Alert.alert('Permission denied', 'Please allow Health access in iOS Settings → Privacy → Health.');
    }
  }

  async function handleHealthKitSync() {
    setSyncing('healthkit');
    try {
      const hkLogs = await fetchHealthKitWorkouts(60);
      const added = await upsertFromIntegration(hkLogs);
      await setIntegrationStatus('healthkit', { lastSynced: new Date().toISOString() });
      Alert.alert('HealthKit sync', `${hkLogs.length} workouts found, ${added as unknown as number} new.`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleStravaConnect() {
    try {
      const tokens = await stravaAuthorize();
      if (tokens) {
        await setIntegrationStatus('strava', {
          connected: true,
          accessToken: tokens.accessToken,
          athleteId: tokens.athleteId,
          lastSynced: undefined,
        });
        await handleStravaSync();
      }
    } catch (e: unknown) {
      Alert.alert('Strava', e instanceof Error ? e.message : 'Connection failed. Check your Client ID in config.ts.');
    }
  }

  async function handleStravaSync() {
    setSyncing('strava');
    try {
      const activities = await fetchStravaActivities(60);
      const added = await upsertFromIntegration(activities);
      await setIntegrationStatus('strava', { lastSynced: new Date().toISOString() });
      Alert.alert('Strava sync', `${activities.length} activities found, ${added as unknown as number} new.`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleStravaDisconnect() {
    await stravaDisconnect();
    await setIntegrationStatus('strava', { connected: false, accessToken: undefined, athleteId: undefined });
  }

  async function handleGarminConnect() {
    Alert.alert(
      'Garmin Connect',
      'Garmin uses OAuth 1.0a which requires a backend proxy for secure signing.\n\nRegister at developer.garmin.com, set up a small server, then enter credentials in src/integrations/config.ts.',
      [{ text: 'Got it' }],
    );
  }

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
      Alert.alert('Wahoo sync', `${workouts.length} workouts found, ${added as unknown as number} new.`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleExportJSON() {
    const json = JSON.stringify(logs, null, 2);
    await Share.share({ message: json, title: 'GHome Fitness — workout logs' });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Connect & Settings</Text>
      <Text style={styles.subtitle}>Sync workouts from Apple Health, Strava, Garmin, and Wahoo.</Text>

      <Text style={styles.sectionTitle}>Integrations</Text>

      <IntegrationCard
        name="Apple Health / HealthKit"
        description="Read workouts, heart rate, HRV, distance from iPhone & Apple Watch."
        connected={integrations.healthkit.connected}
        lastSynced={integrations.healthkit.lastSynced}
        onConnect={handleHealthKitConnect}
        onDisconnect={async () => setIntegrationStatus('healthkit', { connected: false })}
        onSync={handleHealthKitSync}
        note={syncing === 'healthkit' ? 'Syncing…' : 'iOS only · HealthKit entitlement required in Xcode'}
        accentColor={colors.accent}
      />

      <IntegrationCard
        name="Strava"
        description="OAuth 2.0 · Auto-pull rides and runs. Set clientId + clientSecret in config.ts."
        connected={integrations.strava.connected}
        lastSynced={integrations.strava.lastSynced}
        onConnect={handleStravaConnect}
        onDisconnect={handleStravaDisconnect}
        onSync={handleStravaSync}
        note={syncing === 'strava' ? 'Syncing…' : 'strava.com/settings/api → create app → copy credentials'}
        accentColor="#FC4C02"
      />

      <IntegrationCard
        name="Garmin Connect"
        description="OAuth 1.0a · Activities, power, HRV, body battery from Garmin devices."
        connected={integrations.garmin.connected}
        lastSynced={integrations.garmin.lastSynced}
        onConnect={handleGarminConnect}
        onDisconnect={async () => { await garminDisconnect(); await setIntegrationStatus('garmin', { connected: false }); }}
        note="Requires backend proxy for OAuth 1.0a HMAC signing. See src/integrations/garmin.ts."
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
        note={syncing === 'wahoo' ? 'Syncing…' : 'developer.wahooligan.com → register app → set clientId in config.ts'}
        accentColor="#E4002B"
      />

      {/* Architecture table */}
      <Text style={styles.sectionTitle}>Integration architecture</Text>
      <View style={styles.card}>
        {[
          ['Apple Health Adapter', 'react-native-health', 'HealthKit permissions → read workouts, distance, HR, HRV'],
          ['Strava OAuth Service', 'expo-auth-session PKCE', 'Browser → code exchange → access + refresh tokens in SecureStore'],
          ['Garmin Connect', 'Backend OAuth 1.0a proxy', 'Consumer key/secret signed with HMAC-SHA1 server-side'],
          ['Wahoo SYSTM', 'expo-auth-session PKCE', 'OAuth 2.0 → workouts API → upsert by externalId'],
          ['De-dup Engine', 'externalId field', 'Each source writes a unique externalId; upsert skips duplicates'],
          ['Analytics Engine', 'workoutStore', 'Weekly volume, compliance %, planned vs actual per discipline'],
        ].map(([module, tech, purpose]) => (
          <View key={module} style={styles.archRow}>
            <Text style={styles.archModule}>{module}</Text>
            <Text style={styles.archTech}>{tech}</Text>
            <Text style={styles.archPurpose}>{purpose}</Text>
          </View>
        ))}
      </View>

      {/* Data section */}
      <Text style={styles.sectionTitle}>Data</Text>
      <View style={styles.card}>
        <Text style={styles.dataInfo}>{logs.length} workouts saved locally</Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleExportJSON}>
          <Text style={styles.btnPrimaryText}>Export JSON</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  title: { fontSize: typography.xl, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: typography.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: typography.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  integrationCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm,
  },
  integrationHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  integrationName: { fontSize: typography.base, fontWeight: '700', color: colors.text },
  integrationDesc: { color: colors.muted, fontSize: typography.sm, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  lastSynced: { color: colors.muted, fontSize: typography.xs, marginBottom: spacing.sm },
  integrationBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1 },
  btnAccent: { backgroundColor: 'transparent' },
  btnText: { fontWeight: '700', fontSize: typography.sm },
  btnSecondary: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: '#1e293b' },
  btnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: typography.sm },
  integrationNote: { color: colors.muted, fontSize: typography.xs, marginTop: 8, fontStyle: 'italic' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  archRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  archModule: { color: colors.text, fontSize: typography.sm, fontWeight: '600' },
  archTech: { color: colors.accent2, fontSize: typography.xs, marginTop: 2 },
  archPurpose: { color: colors.muted, fontSize: typography.xs, marginTop: 1 },
  dataInfo: { color: colors.text, fontSize: typography.sm, marginBottom: spacing.sm },
  btnPrimary: { backgroundColor: colors.accent, padding: 11, borderRadius: radius.sm, alignItems: 'center' },
  btnPrimaryText: { color: colors.accentDark, fontWeight: '700', fontSize: typography.sm },
});
