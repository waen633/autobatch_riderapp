/**
 * OAuth2 Authorization Code flow with PKCE (server-side callback).
 * GET /api/auth/login    → redirect to Keycloak
 * GET /api/auth/callback → exchange code → set httpOnly cookie + redirect to /
 * GET /api/auth/logout   → clear cookie + redirect to Keycloak logout
 * GET /api/auth/token    → return token from httpOnly session (for frontend to read once)
 */
const express = require('express');
const https = require('https');
const http = require('http');
const router = express.Router();

const KEYCLOAK_URL = () => process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = () => process.env.KEYCLOAK_REALM || 'autobatch';
const CLIENT_ID = () => process.env.KEYCLOAK_CLIENT_ID || 'autobatch-dashboard';
const CLIENT_SECRET = () => process.env.KEYCLOAK_CLIENT_SECRET || '';
const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

function tokenEndpoint() {
  return `${KEYCLOAK_URL()}/realms/${REALM()}/protocol/openid-connect/token`;
}
function authEndpoint() {
  return `${KEYCLOAK_URL()}/realms/${REALM()}/protocol/openid-connect/auth`;
}
function logoutEndpoint() {
  return `${KEYCLOAK_URL()}/realms/${REALM()}/protocol/openid-connect/logout`;
}

function httpPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// GET /api/auth/login
router.get('/login', (req, res) => {
  const redirectUri = `${APP_URL()}/api/auth/callback`;
  const url = new URL(authEndpoint());
  url.searchParams.set('client_id', CLIENT_ID());
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  res.redirect(url.toString());
});

// GET /api/auth/callback
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/login.html?error=' + encodeURIComponent(error));
  if (!code) return res.redirect('/login.html?error=no_code');

  try {
    const redirectUri = `${APP_URL()}/api/auth/callback`;
    const result = await httpPost(tokenEndpoint(), {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      redirect_uri: redirectUri,
      code,
    });

    if (result.status !== 200) {
      console.error('Token exchange failed:', result.body);
      return res.redirect('/login.html?error=token_exchange_failed');
    }

    const tokens = JSON.parse(result.body);
    // Store tokens in server-side session
    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.tokenExpiry = Date.now() + tokens.expires_in * 1000;

    res.redirect('/');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.redirect('/login.html?error=server_error');
  }
});

// GET /api/auth/token — frontend fetches this once after redirect to get token
router.get('/token', (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'No session' });
  }
  // Auto-refresh if near expiry (within 60s)
  const nearExpiry = req.session.tokenExpiry && req.session.tokenExpiry - Date.now() < 60000;
  if (nearExpiry && req.session.refreshToken) {
    refreshToken(req, res);
    return;
  }
  res.json({ access_token: req.session.accessToken });
});

// GET /api/auth/logout
router.get('/logout', (req, res) => {
  const idToken = req.session.idToken || '';
  req.session.destroy(() => {});
  const url = new URL(logoutEndpoint());
  url.searchParams.set('client_id', CLIENT_ID());
  url.searchParams.set('post_logout_redirect_uri', `${APP_URL()}/login.html`);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  res.redirect(url.toString());
});

async function refreshToken(req, res) {
  try {
    const result = await httpPost(tokenEndpoint(), {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      refresh_token: req.session.refreshToken,
    });
    if (result.status === 200) {
      const tokens = JSON.parse(result.body);
      req.session.accessToken = tokens.access_token;
      req.session.refreshToken = tokens.refresh_token;
      req.session.tokenExpiry = Date.now() + tokens.expires_in * 1000;
      res.json({ access_token: tokens.access_token });
    } else {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Session expired, please login again' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Refresh failed' });
  }
}

module.exports = router;
