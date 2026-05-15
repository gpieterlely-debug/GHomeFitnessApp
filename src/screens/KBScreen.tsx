import React, { useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { KB_WORKOUTS, VIDEO_LINKS } from '../data/kbWorkouts';
import { KBWorkout } from '../types';
import { colors, spacing, typography, radius } from '../theme';

export function KBScreen() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Kettlebell Workouts</Text>
      <Text style={styles.subtitle}>3 sessions per week — A, B, C — pulled from your plan.</Text>

      {/* KB workout cards */}
      {KB_WORKOUTS.map((workout: KBWorkout) => (
        <TouchableOpacity
          key={workout.id}
          style={[styles.card, expanded === workout.id && styles.cardExpanded]}
          onPress={() => setExpanded(expanded === workout.id ? null : workout.id)}
          activeOpacity={0.85}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.workoutTitle}>{workout.title}</Text>
              <Text style={styles.workoutGoal}>{workout.goal}</Text>
            </View>
            <Text style={styles.expandIcon}>{expanded === workout.id ? '▲' : '▼'}</Text>
          </View>

          {expanded === workout.id && (
            <View style={styles.exerciseList}>
              <View style={styles.divider} />
              {workout.exercises.map((ex, i) => (
                <View key={i} style={styles.exerciseRow}>
                  <View style={styles.exerciseDot} />
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <Text style={styles.exerciseSets}>{ex.setsReps}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      ))}

      {/* Technique videos */}
      <Text style={styles.sectionTitle}>Technique videos</Text>
      <Text style={styles.subtitle}>Embedded tutorials for key movements.</Text>
      {VIDEO_LINKS.map(v => (
        <View key={v.exercise} style={styles.videoCard}>
          <Text style={styles.videoTitle}>{v.exercise}</Text>
          <Text style={styles.videoSubtitle}>{v.title}</Text>
          <View style={styles.videoWrapper}>
            <WebView
              source={{ uri: v.embed }}
              style={styles.webview}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  title: { fontSize: typography.xl, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: typography.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: typography.lg, fontWeight: '800', color: colors.text, marginTop: spacing.sm, marginBottom: 4 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm,
  },
  cardExpanded: { borderColor: colors.warn },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  workoutTitle: { fontSize: typography.base, fontWeight: '700', color: colors.text, marginBottom: 4 },
  workoutGoal: { color: colors.muted, fontSize: typography.sm },
  expandIcon: { color: colors.muted, fontSize: typography.base, marginLeft: spacing.sm },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.sm },
  exerciseList: { marginTop: 4 },
  exerciseRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
  exerciseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warn, marginTop: 5, marginRight: spacing.sm },
  exerciseInfo: { flex: 1 },
  exerciseName: { color: colors.text, fontSize: typography.sm },
  exerciseSets: { color: colors.accent, fontSize: typography.xs, marginTop: 2, fontWeight: '600' },
  videoCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md,
  },
  videoTitle: { fontSize: typography.base, fontWeight: '700', color: colors.text, marginBottom: 2 },
  videoSubtitle: { color: colors.muted, fontSize: typography.sm, marginBottom: spacing.sm },
  videoWrapper: { borderRadius: radius.md, overflow: 'hidden', aspectRatio: 16 / 9 },
  webview: { flex: 1 },
});
