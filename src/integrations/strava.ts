import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { WorkoutLog } from '../types';
import { STRAVA_CONFIG } from './config';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = '@strava_tokens';

interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId: string;
  athleteName: string;
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  elapsed_time: number;
  distance: number;
  perceived_exertion?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
  description?: string;
}

function mapStravaType(type: string): WorkoutLog['type'] {
  const t = type.toLowerCase();
  if (t.includes('ride') || t.includes('cycling') || t.includes('e-bike')) return 'Bike';
  if (t.includes('run') || t.includes('walk') || t.includes('hike') || t.includes('trail')) return 'Run';
  return 'Kettlebell';
}

async function loadTokens(): Promise<StravaTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveTokens(tokens: StravaTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

async function refreshAccessToken(refreshToken: string): Promise<StravaTokens | null> {
  try {
    const res = await fetch(STRAVA_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CONFIG.clientId,
        client_secret: STRAVA_CONFIG.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tokens: StravaTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at * 1000,
      athleteId: String(data.athlete?.id || ''),
      athleteName: data.athlete?.firstname || '',
    };
    await saveTokens(tokens);
    return tokens;
  } catch { return null; }
}

async function getValidToken(): Promise<string | null> {
  let tokens = await loadTokens();
  if (!tokens) return null;
  if (Date.now() >= tokens.expiresAt - 60000) {
    tokens = await refreshAccessToken(tokens.refreshToken);
  }
  return tokens?.accessToken || null;
}

export async function stravaAuthorize(): Promise<StravaTokens | null> {
  if (!STRAVA_CONFIG.clientId) {
    throw new Error('Strava clientId not set in src/integrations/config.ts');
  }

  const discovery = {
    authorizationEndpoint: STRAVA_CONFIG.authEndpoint,
    tokenEndpoint: STRAVA_CONFIG.tokenEndpoint,
  };

  const request = new AuthSession.AuthRequest({
    clientId: STRAVA_CONFIG.clientId,
    scopes: [STRAVA_CONFIG.scopes],
    redirectUri: STRAVA_CONFIG.redirectUri,
    responseType: AuthSession.ResponseType.Code,
    extraParams: { approval_prompt: 'auto' },
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== 'success') return null;

  const tokenRes = await fetch(STRAVA_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CONFIG.clientId,
      client_secret: STRAVA_CONFIG.clientSecret,
      code: result.params.code,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) return null;
  const data = await tokenRes.json();

  const tokens: StravaTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at * 1000,
    athleteId: String(data.athlete?.id || ''),
    athleteName: data.athlete?.firstname || '',
  };
  await saveTokens(tokens);
  return tokens;
}

export async function stravaDisconnect(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function fetchStravaActivities(daysBack = 30): Promise<WorkoutLog[]> {
  const token = await getValidToken();
  if (!token) return [];

  const after = Math.floor((Date.now() - daysBack * 86400000) / 1000);
  const url = `${STRAVA_CONFIG.apiBase}/athlete/activities?after=${after}&per_page=100`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];

  const activities: StravaActivity[] = await res.json();

  return activities.map(a => ({
    id: `strava-${a.id}`,
    externalId: `strava-${a.id}`,
    date: a.start_date_local.slice(0, 10),
    type: mapStravaType(a.sport_type || a.type),
    session: a.name,
    duration: Math.round(a.elapsed_time / 60),
    distance: parseFloat((a.distance / 1000).toFixed(2)),
    rpe: a.perceived_exertion || 0,
    notes: a.description || 'Imported from Strava',
    source: 'strava',
    heartRateAvg: a.average_heartrate,
    heartRateMax: a.max_heartrate,
    calories: a.calories,
  }));
}

export async function getStravaConnectionStatus(): Promise<{ connected: boolean; athleteId?: string; athleteName?: string }> {
  const tokens = await loadTokens();
  if (!tokens) return { connected: false };
  return { connected: true, athleteId: tokens.athleteId, athleteName: tokens.athleteName };
}
