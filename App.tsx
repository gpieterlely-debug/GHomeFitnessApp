import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useWorkoutStore } from './src/store/workoutStore';
import { colors } from './src/theme';

export default function App() {
  const loadFromStorage = useWorkoutStore(s => s.loadFromStorage);
  const isLoading = useWorkoutStore(s => s.isLoading);

  useEffect(() => { loadFromStorage(); }, []);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
});
