import { Phase, WeekPlan, DayPlan } from '../types';

export const PHASES: Phase[] = [
  { key: 'P1', weeks: [1, 2, 3, 4], focus: 'Technique & base strength' },
  { key: 'P2', weeks: [5, 6, 7, 8], focus: '20 kg intro, volume build' },
  { key: 'P3', weeks: [9, 10, 11, 12], focus: '20 kg standard, test 24 kg' },
  { key: 'P4', weeks: [13, 14, 15, 16], focus: '24 kg standard, intro 28 kg' },
  { key: 'P5', weeks: [17, 18, 19, 20], focus: '28 kg swings/carries, 24 kg squats' },
  { key: 'P6', weeks: [21, 22, 23, 24], focus: 'Heavy crisp work + specificity' },
];

export function getPhaseForWeek(week: number): string {
  if (week <= 4) return 'P1';
  if (week <= 8) return 'P2';
  if (week <= 12) return 'P3';
  if (week <= 16) return 'P4';
  if (week <= 20) return 'P5';
  return 'P6';
}

// Progressive gravel target: +5 km/week, 20% deload every 4th week
function gravelKmTarget(week: number): number {
  if (week === 1) return 30;
  const prev = gravelKmTarget(week - 1);
  return week % 4 === 0 ? Math.max(25, Math.round(prev * 0.8)) : prev + 5;
}

// Run 1 cycles through base minutes with deload week 4
const RUN1_CYCLE = [22, 28, 30, 22];
// Run 3 (easy, appended to KB C session)
const RUN3_CYCLE = [15, 20, 25, 12];

function run1Minutes(week: number): number {
  return RUN1_CYCLE[(week - 1) % 4];
}

function run3Minutes(week: number): number {
  return RUN3_CYCLE[(week - 1) % 4];
}

const KB_PHASE_SETS: Record<string, string> = {
  P1: '3 sets (16 kg)',
  P2: '3–4 sets (20 kg)',
  P3: '4 sets (20 kg, test 24 kg)',
  P4: '4 sets (24 kg, intro 28 kg)',
  P5: '4 sets (28 kg swings, 24 kg squats)',
  P6: '4 sets (28–32 kg, peak)',
};

type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

interface SessionTemplate {
  session: string;
  discipline: 'Bike' | 'Run' | 'Kettlebell';
  details: string;
}

const WEEKLY_TEMPLATE: Record<DayKey, SessionTemplate> = {
  Mon: { session: 'Kettlebell A', discipline: 'Kettlebell', details: 'Push/Hinge + Pull — swings, goblet squat, press, row' },
  Tue: { session: 'Run 1 (Easy + strides)', discipline: 'Run', details: 'Easy conversational + 6×20 s strides' },
  Wed: { session: 'Road Ride (quality)', discipline: 'Bike', details: 'Rotate: Tempo 2–3×10–15 min @Z3 → 4×4 Threshold → Z2 + 6×10 s → Easy Z2' },
  Thu: { session: 'Kettlebell B', discipline: 'Kettlebell', details: 'Pull/Squat + Push — deadlift, split squat, row, press' },
  Fri: { session: 'Run 2 (Hills/Play)', discipline: 'Run', details: 'Short hill bounds / playful sprints / Fartlek intervals' },
  Sat: { session: 'Gravel Ride (Z2)', discipline: 'Bike', details: 'Steady Z2 endurance — keep HR in zone 2' },
  Sun: { session: 'Kettlebell C + Run 3 (Easy)', discipline: 'Kettlebell', details: 'Unilateral + core (TGU, windmill, clean & press) then easy jog' },
};

function buildDayPlan(day: DayKey, week: number, phase: string): DayPlan {
  const template = WEEKLY_TEMPLATE[day];
  let target = '';
  let plannedMinutes = 0;
  let plannedKm: number | undefined;

  switch (template.session) {
    case 'Kettlebell A':
    case 'Kettlebell B':
      target = `50 min · ${KB_PHASE_SETS[phase]}`;
      plannedMinutes = 50;
      break;
    case 'Kettlebell C + Run 3 (Easy)':
      target = `50 min KB + ${run3Minutes(week)} min run`;
      plannedMinutes = 50 + run3Minutes(week);
      break;
    case 'Run 1 (Easy + strides)':
      target = `${run1Minutes(week)} min`;
      plannedMinutes = run1Minutes(week);
      break;
    case 'Run 2 (Hills/Play)':
      target = '25 min';
      plannedMinutes = 25;
      break;
    case 'Road Ride (quality)':
      target = '60–90 min';
      plannedMinutes = 75;
      break;
    case 'Gravel Ride (Z2)': {
      const km = gravelKmTarget(week);
      target = `${km} km`;
      plannedKm = km;
      plannedMinutes = Math.round((km / 20) * 60); // ~20 km/h gravel pace
      break;
    }
  }

  return { day, session: template.session, details: template.details, target, plannedMinutes, plannedKm, discipline: template.discipline };
}

export function buildFullPlan(): WeekPlan[] {
  const days: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Array.from({ length: 24 }, (_, i) => {
    const week = i + 1;
    const phase = getPhaseForWeek(week);
    return { week, phase, days: days.map(d => buildDayPlan(d, week, phase)) };
  });
}

export const FULL_PLAN: WeekPlan[] = buildFullPlan();
