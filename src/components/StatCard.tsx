import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  accent?: boolean;
}

export function StatCard({ label, value, unit, accent }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text style={[styles.value, accent && styles.accentValue]}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    flex: 1,
    minWidth: 120,
  },
  label: { color: colors.muted, fontSize: typography.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  value: { fontSize: typography.xxl, fontWeight: '800', color: colors.text },
  accentValue: { color: colors.accent },
  unit: { fontSize: typography.sm, color: colors.muted, marginLeft: 4, marginBottom: 4 },
});
