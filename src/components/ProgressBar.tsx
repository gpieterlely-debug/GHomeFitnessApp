import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  current: number;
  target: number;
  unit: string;
  formatValue?: (v: number) => string;
}

export function ProgressBar({ label, current, target, unit, formatValue }: Props) {
  const pct = Math.min(100, target > 0 ? (current / target) * 100 : 0);
  const fmt = formatValue || ((v: number) => v.toFixed(v % 1 === 0 ? 0 : 1));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {fmt(current)} / {fmt(target)} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: colors.text, fontSize: typography.sm },
  value: { color: colors.muted, fontSize: typography.sm },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
