import React from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useWorkoutStore } from '../store/workoutStore';
import { StatCard } from '../components/StatCard';
import { ProgressBar } from '../components/ProgressBar';
import { DayCard } from '../components/DayCard';
import { FULL_PLAN } from '../data/plan';
import { colors, spacing, typography, radius } from '../theme';
import { WorkoutLog } from '../types';

// Weekly targets aligned to the plan
const BIKE_TARGET_KM = 40;
const RUN_TARGET_MIN = 90;
const KB_TARGET_MIN = 150;

const TYPE_COLOR: Record<WorkoutLog['type'], string> = {
  Bike: colors.accent2,
  Run: colors.accent,
  Kettlebell: colors.warn,
};

export function DashboardScreen() {
  const getWeekStats = useWorkoutStore(s => s.getWeekStats);
  const getRecentLogs = useWorkoutStore(s => s.getRecentLogs);
  const getCurrentWeek = useWorkoutStore(s => s.getCurrentWeek);
  const integrations = useWorkoutStore(s => s.integrations);

  const stats = getWeekStats(0);
  const recent = getRecentLogs(8);
  const currentWeek = getCurrentWeek();
  const weekPlan = FULL_PLAN[currentWeek - 1];
  const phase = weekPlan.phase;

  const connectedCount = Object.values(integrations).filter(i => i.connected).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Week {currentWeek} · {phase} — {FULL_PLAN.find(p => p.phase === phase)?.phase}</Text>
        </View>
        <View style={styles.pills}>
          <View style={styles.pill}><Text style={styles.pillText}>Phase: {phase}</Text></View>
          {connectedCount > 0 && (
            <View style={[styles.pill, styles.pillAccent]}>
              <Text style={[styles.pillText, { color: colors.accent }]}>{connectedCount} sync'd</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCard label="Bike km (7d)" value={stats.bikeKm.toFixed(1)} unit="km" />
        <StatCard label="Run (7d)" value={stats.runMin} unit="min" />
        <StatCard label="KB (7d)" value={stats.kbMin} unit="min" />
        <StatCard label="Total (7d)" value={stats.totalMin} unit="min" accent />
      </View>

      {/* Progress */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly targets</Text>
        <ProgressBar label="Bike" current={stats.bikeKm} target={BIKE_TARGET_KM} unit="km" />
        <ProgressBar label="Run" current={stats.runMin} target={RUN_TARGET_MIN} unit="min" />
        <ProgressBar label="Kettlebell" current={stats.kbMin} target={KB_TARGET_MIN} unit="min" />
      </View>

      {/* Upcoming sessions (this week's plan) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Week {currentWeek} plan</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.dayRow}>
            {weekPlan.days.map(d => (
              <DayCard key={d.day} day={d} compact />
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Recent entries */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent sessions</Text>
        {recent.length === 0 ? (
          <Text style={styles.empty}>No workouts logged yet. Add one in the Log tab.</Text>
        ) : (
          recent.map(log => (
            <View key={log.id} style={styles.logRow}>
              <View style={[styles.typeDot, { backgroundColor: TYPE_COLOR[log.type] }]} />
              <View style={styles.logInfo}>
                <Text style={styles.logSession}>{log.session}</Text>
                <Text style={styles.logMeta}>{log.date} · {log.duration > 0 ? `${log.duration} min` : ''}{log.distance > 0 ? ` · ${log.distance} km` : ''}{log.rpe > 0 ? ` · RPE ${log.rpe}` : ''}</Text>
              </View>
              <View style={[styles.sourceBadge, { borderColor: colors.line }]}>
                <Text style={styles.sourceText}>{log.source}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Training mix */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>All-time training mix</Text>
        <MixBars />
      </View>
    </ScrollView>
  );
}

function MixBars() {
  const logs = useWorkoutStore(s => s.logs);
  const totals = {
    Bike: logs.filter(l => l.type === 'Bike').reduce((s, l) => s + l.duration, 0),
    Run: logs.filter(l => l.type === 'Run').reduce((s, l) => s + l.duration, 0),
    Kettlebell: logs.filter(l => l.type === 'Kettlebell').reduce((s, l) => s + l.duration, 0),
  };
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;

  return (
    <View>
      {(Object.entries(totals) as [WorkoutLog['type'], number][]).map(([type, min]) => (
        <View key={type} style={styles.mixRow}>
          <Text style={styles.mixLabel}>{type}</Text>
          <View style={styles.mixTrack}>
            <View style={[styles.mixFill, { width: `${(min / sum) * 100}%`, backgroundColor: TYPE_COLOR[type] }]} />
          </View>
          <Text style={styles.mixVal}>{min} min</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  title: { fontSize: typography.xl, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.muted, fontSize: typography.sm, marginTop: 2 },
  pills: { flexDirection: 'row', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  pillAccent: { borderColor: colors.accent },
  pillText: { color: colors.muted, fontSize: typography.xs },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontSize: typography.base, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  dayRow: { flexDirection: 'row', gap: spacing.sm },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  logInfo: { flex: 1 },
  logSession: { color: colors.text, fontSize: typography.sm, fontWeight: '600' },
  logMeta: { color: colors.muted, fontSize: typography.xs, marginTop: 2 },
  sourceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  sourceText: { color: colors.muted, fontSize: typography.xs },
  empty: { color: colors.muted, fontSize: typography.sm, textAlign: 'center', paddingVertical: spacing.md },
  mixRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: spacing.sm },
  mixLabel: { color: colors.text, fontSize: typography.sm, width: 80 },
  mixTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  mixFill: { height: '100%', borderRadius: radius.pill },
  mixVal: { color: colors.muted, fontSize: typography.xs, width: 60, textAlign: 'right' },
});
