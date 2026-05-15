import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { WorkoutLog } from '../types';
import { WAHOO_CONFIG } from './config';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = '@wahoo_tokens';

interface WahooTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

interface WahooWorkout {
  id: number;
  name: string;
  workout_summary?: {
    duration_seconds?: number;
    distance_meters?: number;
    calories_consumed?: number;
    heart_rate_avg?: number;
    heart_rate_max?: number;
  };
  workout_type?: { name?: string };
  created_at: string;
  starts: string;
}

async function loadTokens(): Promise<WahooTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveTokens(tokens: WahooTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

async function refreshToken(refreshTok: string): Promise<WahooTokens | null> {
  try {
    const res = await fetch(WAHOO_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: WAHOO_CONFIG.clientId,
        client_secret: WAHOO_CONFIG.clientSecret,
        refresh_token: refreshTok,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tokens: WahooTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      userId: data.user_id || '',
    };
    await saveTokens(tokens);
    return tokens;
  } catch { return null; }
}

async function getValidToken(): Promise<string | null> {
  let tokens = await loadTokens();
  if (!tokens) return null;
  if (Date.now() >= tokens.expiresAt - 60000) {
    tokens = await refreshToken(tokens.refreshToken);
  }
  return tokens?.accessToken || null;
}

function mapWahooType(typeName?: string): WorkoutLog['type'] {
  const t = (typeName || '').toLowerCase();
  if (t.includes('cycling') || t.includes('bike') || t.includes('ride')) return 'Bike';
  if (t.includes('run') || t.includes('walk') || t.includes('hike')) return 'Run';
  return 'Kettlebell';
}

export async function wahooAuthorize(): Promise<WahooTokens | null> {
  if (!WAHOO_CONFIG.clientId) {
    throw new Error('Wahoo clientId not set in src/integrations/config.ts');
  }

  const discovery = {
    authorizationEndpoint: WAHOO_CONFIG.authEndpoint,
    tokenEndpoint: WAHOO_CONFIG.tokenEndpoint,
  };

  const request = new AuthSession.AuthRequest({
    clientId: WAHOO_CONFIG.clientId,
    scopes: WAHOO_CONFIG.scopes.split(','),
    redirectUri: WAHOO_CONFIG.redirectUri,
    responseType: AuthSession.ResponseType.Code,
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') return null;

  const tokenRes = await fetch(WAHOO_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: WAHOO_CONFIG.clientId,
      client_secret: WAHOO_CONFIG.clientSecret,
      code: result.params.code,
      redirect_uri: WAHOO_CONFIG.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) return null;
  const data = await tokenRes.json();

  const tokens: WahooTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    userId: data.user_id || '',
  };
  await saveTokens(tokens);
  return tokens;
}

export async function wahooDisconnect(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function fetchWahooWorkouts(daysBack = 30): Promise<WorkoutLog[]> {
  const token = await getValidToken();
  if (!token) return [];

  const updatedAfter = new Date(Date.now() - daysBack * 86400000).toISOString();
  const url = `${WAHOO_CONFIG.apiBase}/workouts?updated_after=${updatedAfter}&per_page=100`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];

  const data = await res.json();
  const workouts: WahooWorkout[] = data.workouts || [];

  return workouts.map(w => {
    const summary = w.workout_summary || {};
    return {
      id: `wahoo-${w.id}`,
      externalId: `wahoo-${w.id}`,
      date: (w.starts || w.created_at).slice(0, 10),
      type: mapWahooType(w.workout_type?.name),
      session: w.name || w.workout_type?.name || 'Wahoo Workout',
      duration: Math.round((summary.duration_seconds || 0) / 60),
      distance: parseFloat(((summary.distance_meters || 0) / 1000).toFixed(2)),
      rpe: 0,
      notes: 'Imported from Wahoo',
      source: 'wahoo',
      heartRateAvg: summary.heart_rate_avg,
      heartRateMax: summary.heart_rate_max,
      calories: summary.calories_consumed,
    };
  });
}

export async function getWahooConnectionStatus(): Promise<{ connected: boolean; userId?: string }> {
  const tokens = await loadTokens();
  if (!tokens) return { connected: false };
  return { connected: true, userId: tokens.userId };
}
