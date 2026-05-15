import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DayPlan } from '../types';
import { colors, radius, spacing, typography } from '../theme';

const DISCIPLINE_COLOR: Record<string, string> = {
  Bike: colors.accent2,
  Run: colors.accent,
  Kettlebell: colors.warn,
};

interface Props {
  day: DayPlan;
  compact?: boolean;
  taperMultiplier?: number;
}

export function DayCard({ day, compact, taperMultiplier = 1 }: Props) {
  const accent = DISCIPLINE_COLOR[day.discipline] || colors.muted;
  const isTapered = taperMultiplier < 1;
  const taperedTSS = Math.round(day.plannedTSS * taperMultiplier);

  return (
    <View style={[styles.card, { borderTopColor: accent }]}>
      <Text style={styles.dayLabel}>{day.day}</Text>
      <Text style={styles.session} numberOfLines={compact ? 1 : 2}>{day.session}</Text>
      <Text style={styles.target}>
        {isTapered ? `${Math.round(day.plannedMinutes * taperMultiplier)} min` : day.target}
      </Text>
      <Text style={styles.tss}>{taperedTSS} TSS{isTapered ? ' ⬇' : ''}</Text>
      {!compact && <Text style={styles.details} numberOfLines={2}>{day.details}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(31,41,55,0.8)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 3,
    padding: spacing.sm,
    minWidth: 140,
  },
  dayLabel: { color: colors.muted, fontSize: typography.xs, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  session: { color: colors.text, fontSize: typography.sm, fontWeight: '600', marginBottom: 2 },
  target: { color: colors.accent, fontSize: typography.xs },
  tss: { color: colors.muted, fontSize: typography.xs, marginBottom: 4 },
  details: { color: colors.muted, fontSize: typography.xs, lineHeight: 16 },
});
