import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FULL_PLAN, PHASES } from '../data/plan';
import { DayCard } from '../components/DayCard';
import { colors, spacing, typography, radius } from '../theme';

export function PlanScreen() {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedPhase, setSelectedPhase] = useState<string>('All');

  const weekPlan = FULL_PLAN[selectedWeek - 1];
  const phaseInfo = PHASES.find(p => p.key === weekPlan.phase);

  const filteredWeeks = selectedPhase === 'All'
    ? FULL_PLAN
    : FULL_PLAN.filter(w => w.phase === selectedPhase);

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
            {filteredWeeks.map(w => (
              <TouchableOpacity
                key={w.week}
                style={[styles.weekBtn, selectedWeek === w.week && styles.weekBtnActive]}
                onPress={() => setSelectedWeek(w.week)}
              >
                <Text style={[styles.weekBtnText, selectedWeek === w.week && styles.weekBtnTextActive]}>
                  W{w.week}
                </Text>
                <Text style={styles.weekPhase}>{w.phase}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Selected week header */}
      <View style={styles.weekHeader}>
        <View>
          <Text style={styles.weekTitle}>Week {weekPlan.week}</Text>
          <Text style={styles.weekFocus}>{phaseInfo?.focus}</Text>
        </View>
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseBadgeText}>{weekPlan.phase}</Text>
        </View>
      </View>

      {/* Day cards */}
      <View style={styles.daysGrid}>
        {weekPlan.days.map(d => (
          <View key={d.day} style={styles.dayWrapper}>
            <DayCard day={d} />
          </View>
        ))}
      </View>

      {/* Phase summary */}
      <View style={styles.card} style={styles.phaseCard}>
        <Text style={styles.cardTitle}>Phase overview</Text>
        {PHASES.map(p => (
          <View key={p.key} style={[styles.phaseRow, weekPlan.phase === p.key && styles.phaseRowActive]}>
            <View style={styles.phaseRowLeft}>
              <Text style={[styles.phaseKey, weekPlan.phase === p.key && { color: colors.accent }]}>{p.key}</Text>
              <Text style={styles.phaseWeeks}>Weeks {p.weeks[0]}–{p.weeks[p.weeks.length - 1]}</Text>
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
  phasePill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, marginRight: 8,
  },
  phasePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  phasePillText: { color: colors.muted, fontSize: typography.sm, fontWeight: '600' },
  phasePillTextActive: { color: colors.accentDark },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  cardLabel: { color: colors.muted, fontSize: typography.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  weekRow: { flexDirection: 'row', gap: 8 },
  weekBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center', minWidth: 52 },
  weekBtnActive: { backgroundColor: '#162033', borderColor: '#243244' },
  weekBtnText: { color: colors.muted, fontSize: typography.sm, fontWeight: '700' },
  weekBtnTextActive: { color: colors.text },
  weekPhase: { color: colors.muted, fontSize: 10, marginTop: 2 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  weekTitle: { fontSize: typography.lg, fontWeight: '800', color: colors.text },
  weekFocus: { color: colors.muted, fontSize: typography.sm, marginTop: 2 },
  phaseBadge: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  phaseBadgeText: { color: colors.accentDark, fontWeight: '700', fontSize: typography.sm },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  dayWrapper: { width: '47%' },
  phaseCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontSize: typography.base, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  phaseRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: spacing.md },
  phaseRowActive: { backgroundColor: 'rgba(34,197,94,0.05)', borderRadius: radius.sm },
  phaseRowLeft: { width: 80 },
  phaseKey: { color: colors.muted, fontWeight: '700', fontSize: typography.sm },
  phaseWeeks: { color: colors.muted, fontSize: typography.xs },
  phaseFocus: { color: colors.text, fontSize: typography.sm, flex: 1 },
});
