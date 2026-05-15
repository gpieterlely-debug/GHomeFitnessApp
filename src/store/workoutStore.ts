import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutLog, IntegrationState, WeekStats } from '../types';
import { FULL_PLAN } from '../data/plan';

const STORAGE_KEY = '@ghome_logs_v1';
const INTEGRATION_KEY = '@ghome_integrations_v1';

interface WorkoutStore {
  logs: WorkoutLog[];
  integrations: IntegrationState;
  isLoading: boolean;

  // Actions
  loadFromStorage: () => Promise<void>;
  addLog: (log: Omit<WorkoutLog, 'id' | 'source'> & { source?: WorkoutLog['source'] }) => Promise<void>;
  updateLog: (id: string, updates: Partial<WorkoutLog>) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  upsertFromIntegration: (logs: WorkoutLog[]) => Promise<void>;
  clearAll: () => Promise<void>;
  seedDemoData: () => Promise<void>;
  setIntegrationStatus: (service: keyof IntegrationState, status: Partial<IntegrationState[keyof IntegrationState]>) => Promise<void>;

  // Derived
  getWeekStats: (weeksAgo?: number) => WeekStats;
  getRecentLogs: (n?: number) => WorkoutLog[];
  getLogsForWeek: (week: number) => WorkoutLog[];
  getCurrentWeek: () => number;
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

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  logs: [],
  integrations: DEFAULT_INTEGRATIONS,
  isLoading: true,

  loadFromStorage: async () => {
    try {
      const [logsRaw, intRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(INTEGRATION_KEY),
      ]);
      set({
        logs: logsRaw ? JSON.parse(logsRaw) : [],
        integrations: intRaw ? { ...DEFAULT_INTEGRATIONS, ...JSON.parse(intRaw) } : DEFAULT_INTEGRATIONS,
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
    };
    const logs = [log, ...get().logs];
    set({ logs });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  },

  updateLog: async (id, updates) => {
    const logs = get().logs.map(l => (l.id === id ? { ...l, ...updates } : l));
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
    const newLogs = incoming.filter(l => !l.externalId || !existingExternalIds.has(l.externalId));
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

    const demoLogs: WorkoutLog[] = [
      { id: 'd1', date: d(1), type: 'Bike', session: 'Gravel Ride (Z2)', duration: 110, distance: 36.5, rpe: 6, notes: 'Steady Z2, felt good', source: 'manual' },
      { id: 'd2', date: d(2), type: 'Run', session: 'Run 1 (Easy + strides)', duration: 28, distance: 5.2, rpe: 5, notes: 'With the kid, easy pace', source: 'manual' },
      { id: 'd3', date: d(3), type: 'Kettlebell', session: 'Kettlebell A', duration: 52, distance: 0, rpe: 7, notes: 'Solid press, 20 kg', source: 'manual' },
      { id: 'd4', date: d(4), type: 'Bike', session: 'Road Ride (quality)', duration: 70, distance: 28, rpe: 8, notes: '4×4 threshold intervals', source: 'manual', heartRateAvg: 152, heartRateMax: 171 },
      { id: 'd5', date: d(5), type: 'Kettlebell', session: 'Kettlebell B', duration: 48, distance: 0, rpe: 7, notes: 'Split squats were tough', source: 'manual' },
      { id: 'd6', date: d(6), type: 'Run', session: 'Run 2 (Hills/Play)', duration: 25, distance: 4.1, rpe: 7, notes: 'Hill repeats ×6', source: 'manual' },
      { id: 'd7', date: d(7), type: 'Kettlebell', session: 'Kettlebell C + Run 3 (Easy)', duration: 65, distance: 2.5, rpe: 6, notes: 'TGU clean, jog after', source: 'manual' },
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
    const bikeSessions = inWindow.filter(l => l.type === 'Bike').length;
    const runSessions = inWindow.filter(l => l.type === 'Run').length;
    const kbSessions = inWindow.filter(l => l.type === 'Kettlebell').length;

    return { bikeKm, runMin, kbMin, totalMin, bikeSessions, runSessions, kbSessions };
  },

  getRecentLogs: (n = 10) => {
    return [...get().logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
  },

  getLogsForWeek: (week) => {
    const weekPlan = FULL_PLAN[week - 1];
    if (!weekPlan) return [];
    const sessions = weekPlan.days.map(d => d.session);
    return get().logs.filter(l => sessions.includes(l.session));
  },

  getCurrentWeek: () => {
    // Returns the plan week based on oldest log date or week 1
    const logs = get().logs;
    if (!logs.length) return 1;
    const earliest = [...logs].sort((a, b) => a.date.localeCompare(b.date))[0];
    const start = new Date(earliest.date);
    const now = new Date();
    const weeksDiff = Math.floor((now.getTime() - start.getTime()) / (7 * 86400000));
    return Math.min(24, Math.max(1, weeksDiff + 1));
  },
}));
