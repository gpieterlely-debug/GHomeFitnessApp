// Drop your credentials here once you register each app.
// None of these are committed to git (add .env support via expo-constants if needed).

export const STRAVA_CONFIG = {
  clientId: '', // from strava.com/settings/api
  clientSecret: '', // store in expo-secure-store in production
  redirectUri: 'ghomefitness://strava-callback',
  scopes: 'activity:read_all,activity:write',
  authEndpoint: 'https://www.strava.com/oauth/mobile/authorize',
  tokenEndpoint: 'https://www.strava.com/oauth/token',
  apiBase: 'https://www.strava.com/api/v3',
};

export const GARMIN_CONFIG = {
  consumerKey: '', // from developer.garmin.com/connect-iq
  consumerSecret: '',
  requestTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
  authorizeUrl: 'https://connect.garmin.com/oauthConfirm',
  accessTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
  apiBase: 'https://apis.garmin.com/wellness-api/rest',
};

export const WAHOO_CONFIG = {
  clientId: '', // from developer.wahooligan.com
  clientSecret: '',
  redirectUri: 'ghomefitness://wahoo-callback',
  scopes: 'workouts_read',
  authEndpoint: 'https://api.wahooligan.com/oauth/authorize',
  tokenEndpoint: 'https://api.wahooligan.com/oauth/token',
  apiBase: 'https://api.wahooligan.com/v1',
};
