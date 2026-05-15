import { Platform } from 'react-native';
import { WorkoutLog } from '../types';

// react-native-health types — imported lazily so Android doesn't crash
type AppleHealthKit = typeof import('react-native-health').default;

let AppleHealthKit: AppleHealthKit | null = null;
if (Platform.OS === 'ios') {
  AppleHealthKit = require('react-native-health').default;
}

const READ_PERMISSIONS = [
  'ActiveEnergyBurned',
  'BasalEnergyBurned',
  'Cycling',
  'DistanceCycling',
  'DistanceWalkingRunning',
  'HeartRate',
  'HeartRateVariability',
  'Running',
  'StepCount',
  'Workout',
] as const;

export async function requestHealthKitAuthorization(): Promise<boolean> {
  if (!AppleHealthKit || Platform.OS !== 'ios') return false;

  return new Promise(resolve => {
    AppleHealthKit!.initHealthKit(
      {
        permissions: {
          read: READ_PERMISSIONS as unknown as string[],
          write: ['Workout', 'ActiveEnergyBurned'],
        },
      },
      (err: unknown) => resolve(!err),
    );
  });
}

interface HKWorkout {
  activityName?: string;
  startDate: string;
  endDate: string;
  duration?: number;
  distance?: { value: number; unit: string } | number;
  totalEnergyBurned?: { value: number; unit: string } | number;
  sourceName?: string;
}

function mapHKTypeToWorkoutType(activityName?: string): WorkoutLog['type'] {
  const name = (activityName || '').toLowerCase();
  if (name.includes('cycling') || name.includes('bike') || name.includes('ride')) return 'Bike';
  if (name.includes('run') || name.includes('walk') || name.includes('hike')) return 'Run';
  return 'Kettlebell';
}

function extractDistance(raw: HKWorkout['distance']): number {
  if (!raw) return 0;
  if (typeof raw === 'object' && 'value' in raw) return raw.value / 1000; // m → km
  return typeof raw === 'number' ? raw / 1000 : 0;
}

function extractCalories(raw: HKWorkout['totalEnergyBurned']): number {
  if (!raw) return 0;
  if (typeof raw === 'object' && 'value' in raw) return raw.value;
  return typeof raw === 'number' ? raw : 0;
}

export async function fetchHealthKitWorkouts(daysBack = 30): Promise<WorkoutLog[]> {
  if (!AppleHealthKit || Platform.OS !== 'ios') return [];

  const startDate = new Date(Date.now() - daysBack * 86400000).toISOString();
  const endDate = new Date().toISOString();

  return new Promise(resolve => {
    AppleHealthKit!.getSamples(
      { startDate, endDate, type: 'Workout' } as Parameters<AppleHealthKit['getSamples']>[0],
      (err: unknown, results: HKWorkout[]) => {
        if (err || !Array.isArray(results)) { resolve([]); return; }

        const logs: WorkoutLog[] = results.map((w, i) => {
          const type = mapHKTypeToWorkoutType(w.activityName);
          const durationMin = Math.round((w.duration || 0) / 60);
          const distanceKm = parseFloat(extractDistance(w.distance).toFixed(2));

          return {
            id: `hk-${i}-${new Date(w.startDate).getTime()}`,
            externalId: `hk-${new Date(w.startDate).getTime()}`,
            date: w.startDate.slice(0, 10),
            type,
            session: w.activityName || type,
            duration: durationMin,
            distance: distanceKm,
            rpe: 0,
            notes: `Imported from Apple Health (${w.sourceName || 'HealthKit'})`,
            source: 'healthkit',
            calories: extractCalories(w.totalEnergyBurned),
          };
        });

        resolve(logs);
      },
    );
  });
}

export async function writeWorkoutToHealthKit(log: WorkoutLog): Promise<boolean> {
  if (!AppleHealthKit || Platform.OS !== 'ios') return false;

  const typeMap: Record<WorkoutLog['type'], number> = {
    Bike: 52,       // HKWorkoutActivityTypeCycling
    Run: 37,        // HKWorkoutActivityTypeRunning
    Kettlebell: 20, // HKWorkoutActivityTypeFunctionalStrengthTraining
  };

  const startDate = new Date(`${log.date}T09:00:00`).toISOString();
  const endDate = new Date(new Date(startDate).getTime() + log.duration * 60000).toISOString();

  return new Promise(resolve => {
    AppleHealthKit!.saveWorkout(
      {
        type: typeMap[log.type],
        startDate,
        endDate,
        energyBurned: log.calories || 0,
        distance: (log.distance || 0) * 1000, // km → m
      } as Parameters<AppleHealthKit['saveWorkout']>[0],
      (err: unknown) => resolve(!err),
    );
  });
}
