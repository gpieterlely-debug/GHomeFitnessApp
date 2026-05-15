export type WorkoutType = 'Bike' | 'Run' | 'Kettlebell';
export type IntegrationSource = 'manual' | 'healthkit' | 'strava' | 'garmin' | 'wahoo';

export interface WorkoutLog {
  id: string;
  date: string; // ISO date string YYYY-MM-DD
  type: WorkoutType;
  session: string;
  duration: number; // minutes
  distance: number; // km
  rpe: number; // 1–10
  notes: string;
  source: IntegrationSource;
  externalId?: string;
  heartRateAvg?: number;
  heartRateMax?: number;
  calories?: number;
  tss?: number;
}

export interface DayPlan {
  day: string;
  session: string;
  details: string;
  target: string;
  plannedMinutes: number;
  plannedKm?: number;
  plannedTSS: number;
  sessionIF: number;
  discipline: WorkoutType;
}

export interface WeekPlan {
  week: number;
  phase: string;
  plannedWeekTSS: number;
  days: DayPlan[];
}

export interface Phase {
  key: string;
  weeks: number[];
  focus: string;
}

export type TaperLevel = 'none' | 'light' | 'heavy' | 'race' | 'recovery';

export interface RaceWeekStatus {
  weeksToRace: number | null;
  taperLevel: TaperLevel;
  volumeMultiplier: number;
  label: string;
}

export interface WeekCompliance {
  plannedTSS: number;
  actualTSS: number;
  compliancePct: number;
  bikeCompliancePct: number;
  runCompliancePct: number;
  kbCompliancePct: number;
  bikeKmActual: number;
  bikeKmPlanned: number;
  runMinActual: number;
  runMinPlanned: number;
  kbMinActual: number;
  kbMinPlanned: number;
}

export interface AppSettings {
  planStartDate: string | null;
  raceDate: string | null;
  notificationsEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
}

export interface KBExercise {
  name: string;
  setsReps: string;
}

export interface KBWorkout {
  id: string;
  title: string;
  goal: string;
  exercises: KBExercise[];
}

export interface VideoLink {
  exercise: string;
  title: string;
  embed: string;
}

export interface IntegrationStatus {
  connected: boolean;
  lastSynced?: string;
  error?: string;
}

export interface IntegrationState {
  healthkit: IntegrationStatus;
  strava: IntegrationStatus & { accessToken?: string; athleteId?: string };
  garmin: IntegrationStatus & { accessToken?: string; accessTokenSecret?: string };
  wahoo: IntegrationStatus & { accessToken?: string };
}

export interface WeekStats {
  bikeKm: number;
  runMin: number;
  kbMin: number;
  totalMin: number;
  totalTSS: number;
  bikeSessions: number;
  runSessions: number;
  kbSessions: number;
}
