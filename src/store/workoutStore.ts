import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WorkoutLog, IntegrationState, WeekStats, WeekCompliance, AppSettings,
} from '../types';
import { FULL_PLAN, calcActualTSS, getRaceWeekStatus } from '../data/plan';

const STORAGE_KEY = '@ghome_logs_v1';
const INTEGRATION_KEY = '@ghome_integrations_v1';
const SETTINGS_KEY = '@ghome_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  planStartDate: null,
  raceDate: null,
  notificationsEnabled: false,
  notificationHour: 7,
  notificationMinute: 0,
};

interface WorkoutStore {
  logs: WorkoutLog[];
  integrations: IntegrationState;
  settings: AppSettings;
  isLoading: boolean;

  // Actions
  loadFromStorage: () => Promise<void>;
  addLog: (log: Omit<WorkoutLog, 'id' | 'source'> & { source?: WorkoutLog['source'] }) => Promise<void>;
  updateLog: (id: string, updates: Partial<WorkoutLog>) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  upsertFromIntegration: (logs: WorkoutLog[]) => Promise<number>;
  clearAll: () => Promise<void>;
  seedDemoData: () => Promise<void>;
  setIntegrationStatus: (service: keyof IntegrationState, status: Partial<IntegrationState[keyof IntegrationState]>) => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;

  // Derived
  getWeekStats: (weeksAgo?: number) => WeekStats;
  getRecentLogs: (n?: number) => WorkoutLog[];
  getLogsForWeek: (week: number) => WorkoutLog[];
  getCurrentWeek: () => number;
  getWeekCompliance: (week: number) => WeekCompliance;
  getRaceStatus: (week: number) => ReturnType<typeof getRaceWeekStatus>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_INTEGRATIONS: IntegrationState = {
  healthkit: { connected: false },
  strava: { connected: false },
  garmin: { connected: false },
  wahoo: { connected: false },
};

// Map a calendar date string to a plan week number given a start date
function dateToPlanWeek(date: string, planStartDate: string): number {
  const ms = new Date(date).getTime() - new Date(planStartDate).getTime();
  return Math.min(24, Math.max(1, Math.floor(ms / (7 * 86400000)) + 1));
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  logs: [],
  integrations: DEFAULT_INTEGRATIONS,
  settings: DEFAULT_SETTINGS,
  isLoading: true,

  loadFromStorage: async () => {
    try {
      const [logsRaw, intRaw, settingsRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(INTEGRATION_KEY),
        AsyncStorage.getItem(SETTINGS_KEY),
      ]);
      set({
        logs: logsRaw ? JSON.parse(logsRaw) : [],
        integrations: intRaw ? { ...DEFAULT_INTEGRATIONS, ...JSON.parse(intRaw) } : DEFAULT_INTEGRATIONS,
        settings: settingsRaw ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsRaw) } : DEFAULT_SETTINGS,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addLog: async (logData) => {
    const log: WorkoutLog = {
      id: generateId(),
      source: 'manual',
      ...logData,
      tss: logData.tss ?? calcActualTSS(logData.duration || 0, logData.rpe || 0, logData.type),
    };
    const logs = [log, ...get().logs];
    set({ logs });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  },

  updateLog: async (id, updates) => {
    const logs = get().logs.map(l => {
      if (l.id !== id) return l;
      const merged = { ...l, ...updates };
      return { ...merged, tss: calcActualTSS(merged.duration, merged.rpe, merged.type) };
    });
    set({ logs });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  },

  deleteLog: async (id) => {
    const logs = get().logs.filter(l => l.id !== id);
    set({ logs });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  },

  upsertFromIntegration: async (incoming) => {
    const existing = get().logs;
    const existingExternalIds = new Set(existing.map(l => l.externalId).filter(Boolean));
    const newLogs = incoming
      .filter(l => !l.externalId || !existingExternalIds.has(l.externalId))
      .map(l => ({ ...l, tss: l.tss ?? calcActualTSS(l.duration, l.rpe, l.type) }));
    const logs = [...newLogs, ...existing].sort((a, b) => b.date.localeCompare(a.date));
    set({ logs });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    return newLogs.length;
  },

  clearAll: async () => {
    set({ logs: [] });
    await AsyncStorage.removeItem(STORAGE_KEY);
  },

  seedDemoData: async () => {
    const today = new Date();
    const d = (offset: number) =>
      new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);

    const seed = (log: Omit<WorkoutLog, 'tss'>) => ({
      ...log,
      tss: calcActualTSS(log.duration, log.rpe, log.type),
    });

    const demoLogs: WorkoutLog[] = [
      seed({ id: 'd1', date: d(1), type: 'Bike', session: 'Gravel Ride (Z2)', duration: 110, distance: 36.5, rpe: 6, notes: 'Steady Z2, felt good', source: 'manual' }),
      seed({ id: 'd2', date: d(2), type: 'Run', session: 'Run 1 (Easy + strides)', duration: 28, distance: 5.2, rpe: 5, notes: 'With the kid, easy pace', source: 'manual' }),
      seed({ id: 'd3', date: d(3), type: 'Kettlebell', session: 'Kettlebell A', duration: 52, distance: 0, rpe: 7, notes: 'Solid press, 20 kg', source: 'manual' }),
      seed({ id: 'd4', date: d(4), type: 'Bike', session: 'Road Ride (quality)', duration: 70, distance: 28, rpe: 8, notes: '4×4 threshold intervals', source: 'manual', heartRateAvg: 152, heartRateMax: 171 }),
      seed({ id: 'd5', date: d(5), type: 'Kettlebell', session: 'Kettlebell B', duration: 48, distance: 0, rpe: 7, notes: 'Split squats were tough', source: 'manual' }),
      seed({ id: 'd6', date: d(6), type: 'Run', session: 'Run 2 (Hills/Play)', duration: 25, distance: 4.1, rpe: 7, notes: 'Hill repeats ×6', source: 'manual' }),
      seed({ id: 'd7', date: d(7), type: 'Kettlebell', session: 'Kettlebell C + Run 3 (Easy)', duration: 65, distance: 2.5, rpe: 6, notes: 'TGU clean, jog after', source: 'manual' }),
    ];
    set({ logs: demoLogs });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(demoLogs));
  },

  setIntegrationStatus: async (service, status) => {
    const integrations = {
      ...get().integrations,
      [service]: { ...get().integrations[service], ...status },
    };
    set({ integrations });
    await AsyncStorage.setItem(INTEGRATION_KEY, JSON.stringify(integrations));
  },

  updateSettings: async (updates) => {
    const settings = { ...get().settings, ...updates };
    set({ settings });
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  getWeekStats: (weeksAgo = 0) => {
    const logs = get().logs;
    const now = new Date();
    const cutoff = 7 * (weeksAgo + 1);
    const floor = 7 * weeksAgo;
    const inWindow = logs.filter(l => {
      const age = (now.getTime() - new Date(l.date).getTime()) / 86400000;
      return age >= floor && age < cutoff;
    });

    const bikeKm = inWindow.filter(l => l.type === 'Bike').reduce((s, l) => s + (l.distance || 0), 0);
    const runMin = inWindow.filter(l => l.type === 'Run').reduce((s, l) => s + (l.duration || 0), 0);
    const kbMin = inWindow.filter(l => l.type === 'Kettlebell').reduce((s, l) => s + (l.duration || 0), 0);
    const totalMin = inWindow.reduce((s, l) => s + (l.duration || 0), 0);
    const totalTSS = inWindow.reduce((s, l) => s + (l.tss || 0), 0);
    const bikeSessions = inWindow.filter(l => l.type === 'Bike').length;
    const runSessions = inWindow.filter(l => l.type === 'Run').length;
    const kbSessions = inWindow.filter(l => l.type === 'Kettlebell').length;

    return { bikeKm, runMin, kbMin, totalMin, totalTSS, bikeSessions, runSessions, kbSessions };
  },

  getRecentLogs: (n = 10) => {
    return [...get().logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
  },

  getLogsForWeek: (week) => {
    const { settings, logs } = get();
    if (settings.planStartDate) {
      return logs.filter(l => dateToPlanWeek(l.date, settings.planStartDate!) === week);
    }
    // Fallback: match by session name
    const weekPlan = FULL_PLAN[week - 1];
    if (!weekPlan) return [];
    const sessions = new Set(weekPlan.days.map(d => d.session));
    return logs.filter(l => sessions.has(l.session));
  },

  getCurrentWeek: () => {
    const { settings, logs } = get();
    if (settings.planStartDate) {
      const ms = Date.now() - new Date(settings.planStartDate).getTime();
      return Math.min(24, Math.max(1, Math.floor(ms / (7 * 86400000)) + 1));
    }
    if (!logs.length) return 1;
    const earliest = [...logs].sort((a, b) => a.date.localeCompare(b.date))[0];
    const ms = Date.now() - new Date(earliest.date).getTime();
    return Math.min(24, Math.max(1, Math.floor(ms / (7 * 86400000)) + 1));
  },

  getWeekCompliance: (week) => {
    const weekPlan = FULL_PLAN[week - 1];
    if (!weekPlan) {
      return { plannedTSS: 0, actualTSS: 0, compliancePct: 0, bikeCompliancePct: 0, runCompliancePct: 0, kbCompliancePct: 0, bikeKmActual: 0, bikeKmPlanned: 0, runMinActual: 0, runMinPlanned: 0, kbMinActual: 0, kbMinPlanned: 0 };
    }

    const actual = get().getLogsForWeek(week);
    const plannedTSS = weekPlan.plannedWeekTSS;
    const actualTSS = actual.reduce((s, l) => s + (l.tss || 0), 0);

    const bikeKmPlanned = weekPlan.days.filter(d => d.discipline === 'Bike').reduce((s, d) => s + (d.plannedKm || 0), 0);
    const runMinPlanned = weekPlan.days.filter(d => d.discipline === 'Run').reduce((s, d) => s + d.plannedMinutes, 0);
    const kbMinPlanned = weekPlan.days.filter(d => d.discipline === 'Kettlebell').reduce((s, d) => s + d.plannedMinutes, 0);

    const bikeKmActual = actual.filter(l => l.type === 'Bike').reduce((s, l) => s + (l.distance || 0), 0);
    const runMinActual = actual.filter(l => l.type === 'Run').reduce((s, l) => s + (l.duration || 0), 0);
    const kbMinActual = actual.filter(l => l.type === 'Kettlebell').reduce((s, l) => s + (l.duration || 0), 0);

    const pct = (a: number, p: number) => p > 0 ? Math.round((a / p) * 100) : 0;

    return {
      plannedTSS,
      actualTSS,
      compliancePct: pct(actualTSS, plannedTSS),
      bikeCompliancePct: pct(bikeKmActual, bikeKmPlanned),
      runCompliancePct: pct(runMinActual, runMinPlanned),
      kbCompliancePct: pct(kbMinActual, kbMinPlanned),
      bikeKmActual,
      bikeKmPlanned,
      runMinActual,
      runMinPlanned,
      kbMinActual,
      kbMinPlanned,
    };
  },

  getRaceStatus: (week) => {
    const { settings } = get();
    return getRaceWeekStatus(week, settings.planStartDate, settings.raceDate);
  },
}));
