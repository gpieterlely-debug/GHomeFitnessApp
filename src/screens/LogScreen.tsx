import React, { useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useWorkoutStore } from '../store/workoutStore';
import { WorkoutType } from '../types';
import { colors, spacing, typography, radius } from '../theme';

const WORKOUT_TYPES: WorkoutType[] = ['Bike', 'Run', 'Kettlebell'];

const TYPE_COLOR: Record<WorkoutType, string> = {
  Bike: colors.accent2,
  Run: colors.accent,
  Kettlebell: colors.warn,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogScreen() {
  const [date, setDate] = useState(today());
  const [type, setType] = useState<WorkoutType>('Bike');
  const [session, setSession] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [rpe, setRpe] = useState('');
  const [notes, setNotes] = useState('');

  const addLog = useWorkoutStore(s => s.addLog);
  const deleteLog = useWorkoutStore(s => s.deleteLog);
  const seedDemoData = useWorkoutStore(s => s.seedDemoData);
  const clearAll = useWorkoutStore(s => s.clearAll);
  const getRecentLogs = useWorkoutStore(s => s.getRecentLogs);

  const logs = getRecentLogs(50);

  function resetForm() {
    setDate(today());
    setSession('');
    setDuration('');
    setDistance('');
    setRpe('');
    setNotes('');
  }

  async function handleSave() {
    if (!date) { Alert.alert('Please enter a date'); return; }
    await addLog({
      date,
      type,
      session: session || type,
      duration: parseFloat(duration) || 0,
      distance: parseFloat(distance) || 0,
      rpe: parseInt(rpe, 10) || 0,
      notes,
    });
    resetForm();
  }

  async function handleClear() {
    Alert.alert('Clear all data', 'Delete all saved workouts?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => clearAll() },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Data Input</Text>
        <Text style={styles.subtitle}>Log sessions manually. Integrations sync automatically in the Connect tab.</Text>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add workout</Text>

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {WORKOUT_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, type === t && { backgroundColor: TYPE_COLOR[t] + '22', borderColor: TYPE_COLOR[t] }]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.typeBtnText, type === t && { color: TYPE_COLOR[t] }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Session name</Text>
          <TextInput style={styles.input} value={session} onChangeText={setSession}
            placeholder="Gravel Ride (Z2)" placeholderTextColor={colors.muted} />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Duration (min)</Text>
              <TextInput style={styles.input} value={duration} onChangeText={setDuration}
                keyboardType="numeric" placeholder="60" placeholderTextColor={colors.muted} />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Distance (km)</Text>
              <TextInput style={styles.input} value={distance} onChangeText={setDistance}
                keyboardType="decimal-pad" placeholder="30" placeholderTextColor={colors.muted} />
            </View>
          </View>

          <Text style={styles.label}>RPE (1–10)</Text>
          <TextInput style={styles.input} value={rpe} onChangeText={setRpe}
            keyboardType="numeric" placeholder="7" placeholderTextColor={colors.muted} />

          <Text style={styles.label}>Notes</Text>
          <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes}
            placeholder="Felt strong on hills." placeholderTextColor={colors.muted}
            multiline numberOfLines={3} textAlignVertical="top" />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSave}>
              <Text style={styles.btnPrimaryText}>Save workout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={seedDemoData}>
              <Text style={styles.btnSecondaryText}>Load demo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnDanger} onPress={handleClear}>
              <Text style={styles.btnDangerText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Log table */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Saved workouts ({logs.length})</Text>
          {logs.length === 0 ? (
            <Text style={styles.empty}>No workouts yet.</Text>
          ) : (
            logs.map(log => (
              <View key={log.id} style={styles.logRow}>
                <View style={[styles.typeDot, { backgroundColor: TYPE_COLOR[log.type] }]} />
                <View style={styles.logInfo}>
                  <Text style={styles.logSession}>{log.session}</Text>
                  <Text style={styles.logMeta}>
                    {log.date}{log.duration ? ` · ${log.duration} min` : ''}{log.distance ? ` · ${log.distance} km` : ''}{log.rpe ? ` · RPE ${log.rpe}` : ''}
                  </Text>
                  {log.notes ? <Text style={styles.logNotes} numberOfLines={1}>{log.notes}</Text> : null}
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert('Delete', `Delete "${log.session}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteLog(log.id) },
                  ])}
                >
                  <Text style={styles.deleteBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  title: { fontSize: typography.xl, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: typography.sm, marginBottom: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontSize: typography.base, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: typography.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.inputBg, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.line, color: colors.text, padding: 10, fontSize: typography.base,
    marginBottom: spacing.sm,
  },
  textarea: { minHeight: 72 },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  typeBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  typeBtnText: { color: colors.muted, fontWeight: '700', fontSize: typography.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  btnPrimary: { flex: 1, backgroundColor: colors.accent, padding: 11, borderRadius: radius.sm, alignItems: 'center' },
  btnPrimaryText: { color: colors.accentDark, fontWeight: '700', fontSize: typography.sm },
  btnSecondary: { flex: 1, backgroundColor: '#1e293b', padding: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  btnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: typography.sm },
  btnDanger: { flex: 1, backgroundColor: colors.danger, padding: 11, borderRadius: radius.sm, alignItems: 'center' },
  btnDangerText: { color: 'white', fontWeight: '700', fontSize: typography.sm },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm, marginTop: 4 },
  logInfo: { flex: 1 },
  logSession: { color: colors.text, fontSize: typography.sm, fontWeight: '600' },
  logMeta: { color: colors.muted, fontSize: typography.xs, marginTop: 2 },
  logNotes: { color: colors.muted, fontSize: typography.xs, marginTop: 2, fontStyle: 'italic' },
  deleteBtn: { color: colors.danger, fontSize: typography.lg, paddingHorizontal: spacing.sm },
  empty: { color: colors.muted, fontSize: typography.sm, textAlign: 'center', paddingVertical: spacing.md },
});
