import { KBWorkout, VideoLink } from '../types';

export const KB_WORKOUTS: KBWorkout[] = [
  {
    id: 'kbA',
    title: 'KB A — Push/Hinge + Pull',
    goal: 'Full-body power with hinge + push strength. Crisp form first.',
    exercises: [
      { name: 'Warm-up: Halos + Around the World + hip openers', setsReps: '×10/side · 1 min' },
      { name: 'KB Swings', setsReps: '4×15' },
      { name: 'Goblet Squats', setsReps: '4×10' },
      { name: 'Single-arm KB Press', setsReps: '3×8/side' },
      { name: 'KB Bent-over Row', setsReps: '3×10/side' },
      { name: 'Push-ups (weighted optional)', setsReps: '3×12' },
      { name: 'Farmer\'s Carry', setsReps: '2–3×40–60 sec' },
    ],
  },
  {
    id: 'kbB',
    title: 'KB B — Pull/Squat + Push',
    goal: 'Strength + stability with squat and pull focus. Even tempo.',
    exercises: [
      { name: 'Warm-up: Light halos + lunges + glute bridges', setsReps: '×10/side · ×15' },
      { name: 'KB Deadlift (double if able)', setsReps: '4×12' },
      { name: 'Split Squat (goblet hold)', setsReps: '3×10/side' },
      { name: 'Renegade Row (+push-up if strong)', setsReps: '3×8/side' },
      { name: 'KB Floor/Bench Press', setsReps: '3×8–10' },
      { name: 'KB Upright Row', setsReps: '3×12' },
      { name: 'Russian Twists (with KB)', setsReps: '2×15/side' },
    ],
  },
  {
    id: 'kbC',
    title: 'KB C — Core + Unilateral + Conditioning',
    goal: 'Core, balance, unilateral strength. Smooth TGU mechanics.',
    exercises: [
      { name: 'Warm-up: Halos + single-leg glute bridge', setsReps: '×10/side · ×12/side' },
      { name: 'Turkish Get-up', setsReps: '3×3/side' },
      { name: 'Single-arm Front Squat', setsReps: '3×8/side' },
      { name: 'KB Windmill', setsReps: '3×6/side' },
      { name: 'KB Clean & Press', setsReps: '3×8/side' },
      { name: 'Single-leg Deadlift (contralateral hold)', setsReps: '3×10/side' },
      { name: 'EMOM 5 min: 10 swings + 5 push-ups', setsReps: 'Every minute' },
      { name: 'Optional easy jog', setsReps: '10–25 min' },
    ],
  },
];

export const VIDEO_LINKS: VideoLink[] = [
  { exercise: 'Kettlebell Swing', title: 'Kettlebell Swing Tutorial', embed: 'https://www.youtube.com/embed/YSxHifyI6s8' },
  { exercise: 'Goblet Squat', title: 'Goblet Squat Tutorial', embed: 'https://www.youtube.com/embed/0eW8av1WC4g' },
  { exercise: 'Turkish Get-Up', title: 'Turkish Get-Up Tutorial', embed: 'https://www.youtube.com/embed/JFrItinMcyQ' },
  { exercise: 'Clean & Press', title: 'KB Clean & Press Tutorial', embed: 'https://www.youtube.com/embed/sAtZ4yAsQnI' },
];
