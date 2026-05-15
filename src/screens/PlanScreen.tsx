import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FULL_PLAN, PHASES } from '../data/plan';
import { useWorkoutStore } from '../store/workoutStore';
import { DayCard } from '../components/DayCard';
import { colors, spacing, typography, radius } from '../theme';
import { TaperLevel } from '../types';

const TAPER_COLOR: Record<TaperLevel, string> = {
  none: colors.line,
  light: colors.warn,
  heavy: '#f97316',
  race: colors.danger,
  recovery: colors.accent2,
};

export function PlanScreen() {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedPhase, setSelectedPhase] = useState<string>('All');

  const getRaceStatus = useWorkoutStore(s => s.getRaceStatus);
  const getWeekCompliance = useWorkoutStore(s => s.getWeekCompliance);
  const getCurrentWeek = useWorkoutStore(s => s.getCurrentWeek);
  const settings = useWorkoutStore(s => s.settings);

  const weekPlan = FULL_PLAN[selectedWeek - 1];
  const phaseInfo = PHASES.find(p => p.key === weekPlan.phase);
  const raceStatus = getRaceStatus(selectedWeek);
  const compliance = getWeekCompliance(selectedWeek);
  const currentWeek = getCurrentWeek();

  const filteredWeeks = selectedPhase === 'All'
    ? FULL_PLAN
    : FULL_PLAN.filter(w => w.phase === selectedPhase);

  const taperedTSS = Math.round(weekPlan.plannedWeekTSS * raceStatus.volumeMultiplier);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>24-Week Plan</Text>
      <Text style={styles.subtitle}>6 phases · KB 3×/wk · Run 3×/wk · Bike 1–2×/wk</Text>

      {/* Phase filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.phaseScroll}>
        {['All', ...PHASES.map(p => p.key)].map(key => (
          <TouchableOpacity
            key={key}
            style={[styles.phasePill, selectedPhase === key && styles.phasePillActive]}
            onPress={() => {
              setSelectedPhase(key);
              if (key !== 'All') {
                const phase = PHASES.find(p => p.key === key);
                if (phase) setSelectedWeek(phase.weeks[0]);
              }
            }}
          >
            <Text style={[styles.phasePillText, selectedPhase === key && styles.phasePillTextActive]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Week selector */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Select week</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weekRow}>
            {filteredWeeks.map(w => {
              const rs = getRaceStatus(w.week);
              const isCurrent = w.week === currentWeek;
              return (
                <TouchableOpacity
                  key={w.week}
                  style={[
                    styles.weekBtn,
                    selectedWeek === w.week && styles.weekBtnActive,
                    rs.taperLevel !== 'none' && { borderColor: TAPER_COLOR[rs.taperLevel] },
                  ]}
                  onPress={() => setSelectedWeek(w.week)}
                >
                  <Text style={[styles.weekBtnText, selectedWeek === w.week && styles.weekBtnTextActive]}>
                    W{w.week}
                  </Text>
                  <Text style={styles.weekPhase}>{w.phase}</Text>
                  {isCurrent && <View style={styles.currentDot} />}
                  {rs.taperLevel === 'race' && <Text style={styles.raceIcon}>🏁</Text>}
                  {rs.taperLevel === 'heavy' && <Text style={styles.raceIcon}>⬇</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Selected week header */}
      <View style={styles.weekHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.weekTitleRow}>
            <Text style={styles.weekTitle}>Week {weekPlan.week}</Text>
            {currentWeek === selectedWeek && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Current</Text>
              </View>
            )}
          </View>
          <Text style={styles.weekFocus}>{phaseInfo?.focus}</Text>
        </View>
        <View style={[styles.phaseBadge, raceStatus.taperLevel !== 'none' && { backgroundColor: TAPER_COLOR[raceStatus.taperLevel] + '22', borderColor: TAPER_COLOR[raceStatus.taperLevel] }]}>
          <Text style={[styles.phaseBadgeText, raceStatus.taperLevel !== 'none' && { color: TAPER_COLOR[raceStatus.taperLevel] }]}>
            {raceStatus.label || weekPlan.phase}
          </Text>
        </View>
      </View>

      {/* TSS + Compliance summary */}
      <View style={styles.card}>
        <View style={styles.tssRow}>
          <View style={styles.tssStat}>
            <Text style={styles.tssLabel}>Planned TSS</Text>
            <Text style={styles.tssValue}>{taperedTSS}</Text>
            {raceStatus.volumeMultiplier < 1 && (
              <Text style={styles.tssNote}>({weekPlan.plannedWeekTSS} → {Math.round(raceStatus.volumeMultiplier * 100)}%)</Text>
            )}
          </View>
          <View style={styles.tssStat}>
            <Text style={styles.tssLabel}>Actual TSS</Text>
            <Text style={[styles.tssValue, { color: compliance.actualTSS > 0 ? colors.accent : colors.muted }]}>
              {compliance.actualTSS}
            </Text>
          </View>
          <View style={styles.tssStat}>
            <Text style={styles.tssLabel}>Compliance</Text>
            <Text style={[styles.tssValue, {
              color: compliance.compliancePct >= 90 ? colors.accent
                : compliance.compliancePct >= 70 ? colors.warn
                : compliance.compliancePct > 0 ? colors.danger
                : colors.muted,
            }]}>
              {compliance.compliancePct > 0 ? `${compliance.compliancePct}%` : '—'}
            </Text>
          </View>
        </View>

        {/* Per-discipline compliance */}
        {compliance.actualTSS > 0 && (
          <View style={styles.disciplineRow}>
            {[
              { label: 'Bike', actual: `${compliance.bikeKmActual.toFixed(1)} km`, planned: `${compliance.bikeKmPlanned} km`, pct: compliance.bikeCompliancePct, color: colors.accent2 },
              { label: 'Run', actual: `${compliance.runMinActual} min`, planned: `${compliance.runMinPlanned} min`, pct: compliance.runCompliancePct, color: colors.accent },
              { label: 'KB', actual: `${compliance.kbMinActual} min`, planned: `${compliance.kbMinPlanned} min`, pct: compliance.kbCompliancePct, color: colors.warn },
            ].map(({ label, actual, planned, pct, color }) => (
              <View key={label} style={styles.disciplineStat}>
                <Text style={[styles.disciplineLabel, { color }]}>{label}</Text>
                <Text style={styles.disciplineVal}>{actual}</Text>
                <Text style={styles.disciplineOf}>of {planned}</Text>
                <Text style={[styles.disciplinePct, { color: pct >= 90 ? colors.accent : pct >= 70 ? colors.warn : colors.danger }]}>
                  {pct > 0 ? `${pct}%` : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Day cards */}
      <View style={styles.daysGrid}>
        {weekPlan.days.map(d => (
          <View key={d.day} style={styles.dayWrapper}>
            <DayCard day={d} taperMultiplier={raceStatus.volumeMultiplier} />
          </View>
        ))}
      </View>

      {/* Race countdown (if race date set) */}
      {settings.raceDate && raceStatus.weeksToRace !== null && raceStatus.weeksToRace > 0 && (
        <View style={[styles.card, styles.raceCard]}>
          <Text style={styles.raceTitle}>🏁 {raceStatus.weeksToRace} week{raceStatus.weeksToRace !== 1 ? 's' : ''} to race</Text>
          <Text style={styles.raceDateText}>{settings.raceDate}</Text>
        </View>
      )}

      {/* Phase overview */}
      <View style={styles.phaseCard}>
        <Text style={styles.cardTitle}>Phase overview</Text>
        {PHASES.map(p => (
          <View key={p.key} style={[styles.phaseRow, weekPlan.phase === p.key && styles.phaseRowActive]}>
            <View style={styles.phaseRowLeft}>
              <Text style={[styles.phaseKey, weekPlan.phase === p.key && { color: colors.accent }]}>{p.key}</Text>
              <Text style={styles.phaseWeeks}>Wk {p.weeks[0]}–{p.weeks[p.weeks.length - 1]}</Text>
            </View>
            <Text style={styles.phaseFocus}>{p.focus}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  title: { fontSize: typography.xl, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: typography.sm, marginBottom: spacing.md },
  phaseScroll: { marginBottom: spacing.md },
  phasePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, marginRight: 8 },
  phasePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  phasePillText: { color: colors.muted, fontSize: typography.sm, fontWeight: '600' },
  phasePillTextActive: { color: colors.accentDark },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  cardLabel: { color: colors.muted, fontSize: typography.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  weekRow: { flexDirection: 'row', gap: 8 },
  weekBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center', minWidth: 52, position: 'relative' },
  weekBtnActive: { backgroundColor: '#162033', borderColor: '#243244' },
  weekBtnText: { color: colors.muted, fontSize: typography.sm, fontWeight: '700' },
  weekBtnTextActive: { color: colors.text },
  weekPhase: { color: colors.muted, fontSize: 10, marginTop: 2 },
  currentDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  raceIcon: { fontSize: 10, marginTop: 2 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  weekTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  weekTitle: { fontSize: typography.lg, fontWeight: '800', color: colors.text },
  currentBadge: { backgroundColor: colors.accent + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accent },
  currentBadgeText: { color: colors.accent, fontSize: typography.xs, fontWeight: '700' },
  weekFocus: { color: colors.muted, fontSize: typography.sm },
  phaseBadge: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent' },
  phaseBadgeText: { color: colors.accentDark, fontWeight: '700', fontSize: typography.sm },
  tssRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.sm },
  tssStat: { alignItems: 'center' },
  tssLabel: { color: colors.muted, fontSize: typography.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
  tssValue: { fontSize: typography.xxl, fontWeight: '800', color: colors.text, marginTop: 2 },
  tssNote: { color: colors.muted, fontSize: typography.xs, marginTop: 2 },
  disciplineRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm, gap: spacing.xs },
  disciplineStat: { flex: 1, alignItems: 'center' },
  disciplineLabel: { fontSize: typography.xs, fontWeight: '700', textTransform: 'uppercase' },
  disciplineVal: { color: colors.text, fontSize: typography.sm, marginTop: 2 },
  disciplineOf: { color: colors.muted, fontSize: typography.xs },
  disciplinePct: { fontSize: typography.sm, fontWeight: '700', marginTop: 2 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  dayWrapper: { width: '47%' },
  raceCard: { borderColor: colors.danger, backgroundColor: colors.danger + '11' },
  raceTitle: { color: colors.danger, fontWeight: '700', fontSize: typography.base },
  raceDateText: { color: colors.muted, fontSize: typography.sm, marginTop: 2 },
  phaseCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontSize: typography.base, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  phaseRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: spacing.md },
  phaseRowActive: { backgroundColor: 'rgba(34,197,94,0.05)', borderRadius: radius.sm },
  phaseRowLeft: { width: 72 },
  phaseKey: { color: colors.muted, fontWeight: '700', fontSize: typography.sm },
  phaseWeeks: { color: colors.muted, fontSize: typography.xs },
  phaseFocus: { color: colors.text, fontSize: typography.sm, flex: 1 },
});
