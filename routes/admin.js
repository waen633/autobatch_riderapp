const express = require('express');
const https = require('https');
const http = require('http');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { listUsers, upsertUser, deleteUser, DEFAULT_FLAGS } = require('../lib/permissionsDb');

router.use(requireAuth, requireAdmin);

// ─── Keycloak Admin API helpers ───────────────────────────────────────────────
const KC_URL   = () => process.env.KEYCLOAK_URL   || 'http://localhost:8080';
const KC_REALM = () => process.env.KEYCLOAK_REALM || 'autobatch';

function httpReq(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
    };
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function httpForm(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Get short-lived master admin token for Keycloak Admin API
async function getAdminToken() {
  const adminUser = process.env.KEYCLOAK_ADMIN_USER || 'admin';
  const adminPass = process.env.KEYCLOAK_ADMIN_PASS || 'admin';
  const r = await httpForm(
    `${KC_URL()}/realms/master/protocol/openid-connect/token`,
    { grant_type: 'password', client_id: 'admin-cli', username: adminUser, password: adminPass }
  );
  if (r.status !== 200) throw new Error('Cannot get Keycloak admin token');
  return JSON.parse(r.body).access_token;
}

async function kcRequest(method, path, body) {
  const token = await getAdminToken();
  const url = `${KC_URL()}/admin/realms/${KC_REALM()}${path}`;
  return httpReq(method, url, body, { Authorization: `Bearer ${token}` });
}

// ─── Dashboard Permission CRUD ────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', (req, res) => res.json(listUsers()));

// POST /api/admin/users/:id — update permissions
router.post('/users/:id', (req, res) => {
  const { display_name, email, allowed_stores, feature_flags } = req.body;
  const updated = upsertUser(req.params.id, {
    displayName: display_name, email, allowedStores: allowed_stores, featureFlags: feature_flags,
  });
  res.json(updated);
});

// DELETE /api/admin/users/:id — remove from permissionsDb only
router.delete('/users/:id', (req, res) => {
  deleteUser(req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/default-flags
router.get('/default-flags', (req, res) => res.json(DEFAULT_FLAGS));

// ─── Keycloak User CRUD ───────────────────────────────────────────────────────

// GET /api/admin/keycloak/users — list all Keycloak users with roles
router.get('/keycloak/users', async (req, res) => {
  try {
    const r = await kcRequest('GET', '/users?max=200');
    if (r.status !== 200) return res.status(r.status).json({ error: r.body });
    const users = JSON.parse(r.body);
    // Fetch roles for each user
    const withRoles = await Promise.all(users.map(async u => {
      try {
        const rr = await kcRequest('GET', `/users/${u.id}/role-mappings/realm`);
        const roles = rr.status === 200 ? JSON.parse(rr.body).map(r => r.name) : [];
        return { ...u, realmRoles: roles };
      } catch { return { ...u, realmRoles: [] }; }
    }));
    res.json(withRoles);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/keycloak/users — create user in Keycloak + register in DB
router.post('/keycloak/users', async (req, res) => {
  const { username, email, firstName, lastName, password, role, allowed_stores, feature_flags } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    // Create in Keycloak
    const r = await kcRequest('POST', '/users', {
      username, email: email || '', firstName: firstName || '', lastName: lastName || '',
      enabled: true, emailVerified: true,
      credentials: [{ type: 'password', value: password, temporary: false }],
    });
    if (r.status !== 201) return res.status(r.status).json({ error: r.body });

    // Get new user's ID from Location header — re-fetch by username
    const search = await kcRequest('GET', `/users?username=${encodeURIComponent(username)}&exact=true`);
    const users = JSON.parse(search.body);
    if (!users.length) return res.status(500).json({ error: 'User created but not found' });
    const newUser = users[0];

    // Assign role
    if (role === 'admin' || role === 'user') {
      const roleRes = await kcRequest('GET', `/roles/${role}`);
      if (roleRes.status === 200) {
        await kcRequest('POST', `/users/${newUser.id}/role-mappings/realm`, [JSON.parse(roleRes.body)]);
      }
    }

    // Register in permissionsDb
    upsertUser(newUser.id, {
      displayName: `${firstName || ''} ${lastName || ''}`.trim() || username,
      email: email || '',
      allowedStores: allowed_stores || '',
      featureFlags: feature_flags || { ...DEFAULT_FLAGS },
    });

    res.status(201).json({ ok: true, id: newUser.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/keycloak/users/:id — update user info + role in Keycloak
router.put('/keycloak/users/:id', async (req, res) => {
  const { id } = req.params;
  const { email, firstName, lastName, password, role, allowed_stores, feature_flags } = req.body;
  try {
    // Update profile in Keycloak
    const updateBody = { email, firstName, lastName };
    await kcRequest('PUT', `/users/${id}`, updateBody);

    // Reset password if provided
    if (password) {
      await kcRequest('PUT', `/users/${id}/reset-password`, { type: 'password', value: password, temporary: false });
    }

    // Update role: remove old roles, assign new one
    if (role === 'admin' || role === 'user') {
      const allRoles = await kcRequest('GET', `/users/${id}/role-mappings/realm`);
      const existing = JSON.parse(allRoles.body).filter(r => ['admin','user'].includes(r.name));
      if (existing.length) await kcRequest('DELETE', `/users/${id}/role-mappings/realm`, existing);
      const roleRes = await kcRequest('GET', `/roles/${role}`);
      if (roleRes.status === 200) {
        await kcRequest('POST', `/users/${id}/role-mappings/realm`, [JSON.parse(roleRes.body)]);
      }
    }

    // Update permissionsDb
    upsertUser(id, {
      displayName: `${firstName || ''} ${lastName || ''}`.trim(),
      email: email || '',
      allowedStores: allowed_stores,
      featureFlags: feature_flags,
    });

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/keycloak/users/:id — delete from Keycloak + permissionsDb
router.delete('/keycloak/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await kcRequest('DELETE', `/users/${id}`);
    deleteUser(id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/keycloak/users/import — bulk import array of users
router.post('/keycloak/users/import', async (req, res) => {
  const { users } = req.body; // [{ username, email, firstName, lastName, password, role, allowed_stores }]
  if (!Array.isArray(users) || !users.length) return res.status(400).json({ error: 'No users provided' });
  const results = [];
  for (const u of users) {
    try {
      // Create in Keycloak
      const r = await kcRequest('POST', '/users', {
        username: u.username, email: u.email || '', firstName: u.firstName || '', lastName: u.lastName || '',
        enabled: true, emailVerified: true,
        credentials: [{ type: 'password', value: u.password || 'Changeme@1234', temporary: true }],
      });
      if (r.status !== 201) { results.push({ username: u.username, ok: false, error: r.body }); continue; }

      const search = await kcRequest('GET', `/users?username=${encodeURIComponent(u.username)}&exact=true`);
      const found = JSON.parse(search.body);
      if (!found.length) { results.push({ username: u.username, ok: false, error: 'not found after create' }); continue; }
      const newUser = found[0];

      const roleToAssign = u.role === 'admin' ? 'admin' : 'user';
      const roleRes = await kcRequest('GET', `/roles/${roleToAssign}`);
      if (roleRes.status === 200) {
        await kcRequest('POST', `/users/${newUser.id}/role-mappings/realm`, [JSON.parse(roleRes.body)]);
      }
      upsertUser(newUser.id, {
        displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username,
        email: u.email || '',
        allowedStores: u.allowed_stores || '',
        featureFlags: { ...DEFAULT_FLAGS },
      });
      results.push({ username: u.username, ok: true, id: newUser.id });
    } catch (e) { results.push({ username: u.username, ok: false, error: e.message }); }
  }
  res.json({ results, total: users.length, success: results.filter(r => r.ok).length });
});

module.exports = router;
