/**
 * JWT middleware — verifies Keycloak-issued access tokens via JWKS.
 * Does NOT use keycloak-connect (session-based); uses Bearer token only.
 */
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'autobatch';

// Simple in-memory JWKS cache (refresh every 10 min)
let jwksCache = null;
let jwksCacheTime = 0;

async function fetchJwks() {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < 10 * 60 * 1000) return jwksCache;

  const url = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`;
  const data = await httpGet(url);
  jwksCache = JSON.parse(data).keys;
  jwksCacheTime = now;
  return jwksCache;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// base64url → base64
function b64url(s) {
  return s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 2) % 3);
}

function b64ToBuffer(s) {
  return Buffer.from(b64url(s), 'base64');
}

function jwkToPem(jwk) {
  // Use Node's built-in createPublicKey from JWK (Node 15+)
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function base64urlDecode(str) {
  return Buffer.from(b64url(str), 'base64').toString('utf8');
}

async function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const header = JSON.parse(base64urlDecode(parts[0]));
  const payload = JSON.parse(base64urlDecode(parts[1]));

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');

  // Find matching JWK by kid
  const keys = await fetchJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('No matching JWK found');

  const pubKey = jwkToPem(jwk);
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = b64ToBuffer(parts[2]);

  const alg = header.alg || 'RS256';
  const nodeAlg = alg.replace('RS', 'SHA').replace('ES', 'SHA');

  const valid = crypto.verify(nodeAlg, Buffer.from(signingInput), pubKey, signature);
  if (!valid) throw new Error('Invalid signature');

  return payload;
}

// Extract roles from Keycloak token
function extractRoles(payload) {
  const realmRoles = (payload.realm_access && payload.realm_access.roles) || [];
  return realmRoles;
}

// ─── Middleware ───────────────────────────────────────────────

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token' });
  }
  const token = authHeader.slice(7);
  verifyToken(token)
    .then((payload) => {
      req.user = {
        id: payload.sub,
        name: payload.name || payload.preferred_username || '',
        email: payload.email || '',
        username: payload.preferred_username || '',
        roles: extractRoles(payload),
        token,
      };
      next();
    })
    .catch((err) => {
      res.status(401).json({ error: 'Unauthorized — ' + err.message });
    });
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden — admin only' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, verifyToken };
