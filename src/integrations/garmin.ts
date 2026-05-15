import * as SecureStore from 'expo-secure-store';
import { WorkoutLog } from '../types';
import { GARMIN_CONFIG } from './config';

// Garmin Connect uses OAuth 1.0a — more complex than OAuth 2.0.
// Full flow: request token → browser authorize → access token exchange.
// In production this is best handled through a small backend proxy
// to avoid exposing the consumer secret on-device.

const TOKEN_KEY = '@garmin_tokens';

interface GarminTokens {
  accessToken: string;
  accessTokenSecret: string;
  userId: string;
}

interface GarminActivity {
  activityId: number;
  activityName: string;
  startTimeLocal: string;
  duration: number; // seconds
  distance?: number; // meters
  averageHR?: number;
  maxHR?: number;
  calories?: number;
  activityType?: { typeKey: string };
}

export async function getGarminConnectionStatus(): Promise<{ connected: boolean; userId?: string }> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!raw) return { connected: false };
    const tokens: GarminTokens = JSON.parse(raw);
    return { connected: true, userId: tokens.userId };
  } catch { return { connected: false }; }
}

export async function garminDisconnect(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function mapGarminType(typeKey?: string): WorkoutLog['type'] {
  const t = (typeKey || '').toLowerCase();
  if (t.includes('cycling') || t.includes('bike') || t.includes('indoor_cycling') || t.includes('gravel')) return 'Bike';
  if (t.includes('running') || t.includes('trail_running') || t.includes('walking') || t.includes('hiking')) return 'Run';
  return 'Kettlebell';
}

// NOTE: Garmin Connect API requires a backend token exchange for OAuth 1.0a.
// The function below shows what the full fetch would look like once
// you have a server that exchanges and holds access tokens securely.
// See: https://developer.garmin.com/gc-developer-program/overview/

export async function fetchGarminActivities(_daysBack = 30): Promise<WorkoutLog[]> {
  const status = await getGarminConnectionStatus();
  if (!status.connected) return [];

  if (!GARMIN_CONFIG.consumerKey) {
    throw new Error('Garmin credentials not set in src/integrations/config.ts');
  }

  // In a real implementation, your backend would proxy this call with HMAC-SHA1 signing.
  // Example endpoint (replace with your proxy URL):
  //   GET /api/garmin/activities?userId=...&daysBack=...
  //   Response: GarminActivity[]
  console.warn('Garmin: proxy backend not configured. Set up backend or use direct API with OAuth 1.0a signing.');
  return [];
}

export function parseGarminActivities(activities: GarminActivity[]): WorkoutLog[] {
  return activities.map(a => ({
    id: `garmin-${a.activityId}`,
    externalId: `garmin-${a.activityId}`,
    date: a.startTimeLocal.slice(0, 10),
    type: mapGarminType(a.activityType?.typeKey),
    session: a.activityName,
    duration: Math.round(a.duration / 60),
    distance: parseFloat(((a.distance || 0) / 1000).toFixed(2)),
    rpe: 0,
    notes: 'Imported from Garmin Connect',
    source: 'garmin',
    heartRateAvg: a.averageHR,
    heartRateMax: a.maxHR,
    calories: a.calories,
  }));
}

// Save tokens once your backend provides them
export async function saveGarminTokens(tokens: GarminTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}
