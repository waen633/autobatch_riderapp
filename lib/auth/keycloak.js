const crypto = require('crypto');
const {
  ADMIN_MENUS,
  DEFAULT_MENUS,
  applyMenuPermission,
  buildEffectivePermission,
  getUserMenuPermissionMap,
  upsertUserMenuPermission
} = require('../userMenuPermissions');

const MANAGED_ROLES = ['admin', 'user'];

let jwksCache = { fetchedAt: 0, keys: [] };
let adminTokenCache = { expiresAt: 0, token: null };
const userProfileCache = new Map();

function getConfig() {
  const baseUrl = (process.env.KEYCLOAK_BASE_URL || '').replace(/\/+$/, '');
  const realm = process.env.KEYCLOAK_REALM || '';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || '';
  const issuer = process.env.KEYCLOAK_ISSUER || (baseUrl && realm ? `${baseUrl}/realms/${realm}` : '');
  const jwksUri = process.env.KEYCLOAK_JWKS_URI || (issuer ? `${issuer}/protocol/openid-connect/certs` : '');
  const adminRole = process.env.KEYCLOAK_ADMIN_ROLE || 'admin';
  const userRole = process.env.KEYCLOAK_USER_ROLE || 'user';
  return { baseUrl, realm, clientId, issuer, jwksUri, adminRole, userRole };
}

function getPublicConfig() {
  const { baseUrl, realm, clientId } = getConfig();
  return {
    enabled: Boolean(baseUrl && realm && clientId),
    url: baseUrl,
    realm,
    clientId
  };
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function parseCsv(value) {
  if (Array.isArray(value)) return value.flatMap(parseCsv);
  if (value == null) return [];
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeAttributes(attributes = {}) {
  const first = key => {
    const value = attributes[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    allowedStoreCodes: parseCsv(attributes.allowedStoreCodes || attributes.storeCodes),
    allowedZones: parseCsv(attributes.allowedZones || attributes.zoneNames),
    displayName: first('displayName') || ''
  };
}

function keycloakSingleValueAttribute(value) {
  const values = parseCsv(value);
  return values.length ? [values.join(',')] : [];
}

function buildKeycloakAccessAttributes(input = {}) {
  return {
    allowedStoreCodes: keycloakSingleValueAttribute(input.allowedStoreCodes),
    allowedZones: keycloakSingleValueAttribute(input.allowedZones)
  };
}

function getRoles(payload) {
  const { clientId } = getConfig();
  const realmRoles = payload.realm_access?.roles || [];
  const clientRoles = clientId ? payload.resource_access?.[clientId]?.roles || [] : [];
  return [...new Set([...realmRoles, ...clientRoles])];
}

function hasAdminRole(user) {
  const { adminRole } = getConfig();
  return user.roles.includes(adminRole);
}

function buildUser(payload, attributes = {}) {
  const attr = normalizeAttributes(attributes);
  const roles = getRoles(payload);
  const isAdmin = roles.includes(getConfig().adminRole);
  return {
    id: payload.sub,
    username: payload.preferred_username || payload.email || payload.sub,
    email: payload.email || '',
    displayName: attr.displayName || payload.name || payload.preferred_username || '',
    roles,
    isAdmin,
    role: isAdmin ? 'admin' : 'user',
    menus: isAdmin ? ADMIN_MENUS : ['dashboard'],
    allowedStoreCodes: isAdmin ? [] : attr.allowedStoreCodes,
    allowedZones: isAdmin ? [] : attr.allowedZones
  };
}

async function fetchJwks() {
  const { jwksUri } = getConfig();
  if (!jwksUri) throw new Error('KEYCLOAK_JWKS_URI or issuer config is required');
  if (Date.now() - jwksCache.fetchedAt < 10 * 60 * 1000 && jwksCache.keys.length) return jwksCache.keys;

  const res = await fetch(jwksUri);
  if (!res.ok) throw new Error(`Unable to fetch Keycloak JWKS (${res.status})`);
  const body = await res.json();
  jwksCache = { fetchedAt: Date.now(), keys: body.keys || [] };
  return jwksCache.keys;
}

async function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('Unsupported token algorithm');

  const keys = await fetchJwks();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown token key');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signatureValid = verifier.verify(publicKey, base64UrlDecode(parts[2]));
  if (!signatureValid) throw new Error('Invalid token signature');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp <= now) throw new Error('Token expired');
  if (payload.nbf && payload.nbf > now) throw new Error('Token not active');

  const { issuer } = getConfig();
  if (issuer && payload.iss !== issuer) throw new Error('Invalid token issuer');

  const audience = process.env.KEYCLOAK_AUDIENCE;
  if (audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
    if (!aud.includes(audience)) throw new Error('Invalid token audience');
  }

  return payload;
}

async function getAdminAccessToken() {
  const { baseUrl, realm } = getConfig();
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  if (!baseUrl || !realm || !clientId || !clientSecret) {
    throw new Error('Keycloak admin client env is not configured');
  }
  if (adminTokenCache.token && Date.now() < adminTokenCache.expiresAt) return adminTokenCache.token;

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);

  const res = await fetch(`${baseUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  if (!res.ok) throw new Error(`Unable to obtain Keycloak admin token (${res.status})`);
  const body = await res.json();
  adminTokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(30, (body.expires_in || 60) - 15) * 1000
  };
  return adminTokenCache.token;
}

async function keycloakAdminFetch(path, options = {}) {
  const { baseUrl, realm } = getConfig();
  const token = await getAdminAccessToken();
  const res = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (res.status === 204) return { res, data: null };
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.errorMessage || data?.error || `Keycloak admin request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return { res, data };
}

async function getKeycloakUser(userId) {
  if (!userId) return null;
  const cached = userProfileCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  try {
    const { data } = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);
    userProfileCache.set(userId, { data, expiresAt: Date.now() + 60 * 1000 });
    return data;
  } catch {
    return null;
  }
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Authentication required' });
    const payload = await verifyJwt(match[1]);
    const kcUser = await getKeycloakUser(payload.sub);
    req.authToken = payload;
    req.user = await applyMenuPermission(buildUser(payload, kcUser?.attributes || {}));
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !hasAdminRole(req.user)) return res.status(403).json({ error: 'Admin role required' });
  next();
}

function requireMenu(menuKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.isAdmin || req.user.menus.includes(menuKey)) return next();
    return res.status(403).json({ error: 'Menu access denied' });
  };
}

function intersectScope(requested, allowed) {
  const requestedList = parseCsv(requested);
  if (!allowed.length) return requestedList;
  if (!requestedList.length) return allowed;
  return requestedList.filter(v => allowed.includes(v));
}

function enforceUserScope(req, res, next) {
  if (!req.user || req.user.isAdmin) return next();

  const allowedStores = req.user.allowedStoreCodes || [];
  const allowedZones = req.user.allowedZones || [];

  if (req.query.storeCode !== undefined && allowedStores.length) {
    const scoped = intersectScope(req.query.storeCode, allowedStores);
    if (!scoped.length) return res.status(403).json({ error: 'Store access denied' });
    req.query.storeCode = scoped.join(',');
  }

  if (req.query.zoneName !== undefined && allowedZones.length) {
    const scoped = intersectScope(req.query.zoneName, allowedZones);
    if (!scoped.length) return res.status(403).json({ error: 'Zone access denied' });
    req.query.zoneName = scoped.join(',');
  }

  const originalJson = res.json.bind(res);
  res.json = body => {
    if (body && Array.isArray(body.data) && allowedStores.length) {
      const filtered = body.data.filter(row => !row || row.storeCode == null || allowedStores.includes(String(row.storeCode)));
      body = {
        ...body,
        count: typeof body.count === 'number' ? filtered.length : body.count,
        data: filtered
      };
      if (body.batchTimeMap && typeof body.batchTimeMap === 'object') {
        body.batchTimeMap = Object.fromEntries(
          Object.entries(body.batchTimeMap).filter(([storeCode]) => allowedStores.includes(String(storeCode)))
        );
      }
    }
    return originalJson(body);
  };

  next();
}

async function getRealmRole(roleName) {
  const { data } = await keycloakAdminFetch(`/roles/${encodeURIComponent(roleName)}`);
  return data;
}

async function syncManagedRealmRole(userId, targetRole) {
  const roles = await Promise.all(MANAGED_ROLES.map(getRealmRole));
  const { data: currentRoles } = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}/role-mappings/realm`);
  const currentManaged = (currentRoles || []).filter(r => MANAGED_ROLES.includes(r.name));
  if (currentManaged.length) {
    await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}/role-mappings/realm`, {
      method: 'DELETE',
      body: JSON.stringify(currentManaged)
    });
  }
  const nextRole = roles.find(r => r.name === targetRole);
  if (nextRole) {
    await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([nextRole])
    });
  }
}

function serializeUser(u, role = 'user') {
  const attrs = normalizeAttributes(u.attributes || {});
  const effectivePermission = buildEffectivePermission({
    id: u.id,
    username: u.username,
    email: u.email || '',
    isAdmin: role === 'admin'
  }, u.menuPermission);

  return {
    id: u.id,
    username: u.username,
    email: u.email || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    enabled: u.enabled !== false,
    role,
    menus: effectivePermission.menus,
    allowedStoreCodes: attrs.allowedStoreCodes,
    allowedZones: attrs.allowedZones
  };
}

async function listUsers(search = '') {
  const q = new URLSearchParams({ max: '100' });
  if (search) q.set('search', search);
  const { data } = await keycloakAdminFetch(`/users?${q.toString()}`);
  const users = data || [];
  const permissionMap = await getUserMenuPermissionMap(users.map(user => user.id));
  return Promise.all(users.map(async user => {
    user.menuPermission = permissionMap.get(user.id) || null;
    try {
      const { data: roles } = await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}/role-mappings/realm`);
      const managedRole = (roles || []).find(r => MANAGED_ROLES.includes(r.name))?.name || 'user';
      return serializeUser(user, managedRole);
    } catch {
      return serializeUser(user);
    }
  }));
}

async function createUser(input) {
  const attrs = buildKeycloakAccessAttributes(input);
  const role = input.role === 'admin' ? 'admin' : 'user';
  const body = {
    username: input.username,
    email: input.email || undefined,
    firstName: input.firstName || undefined,
    lastName: input.lastName || undefined,
    enabled: input.enabled !== false,
    attributes: attrs,
    credentials: input.password ? [{ type: 'password', value: input.password, temporary: !!input.temporaryPassword }] : undefined
  };
  const { res } = await keycloakAdminFetch('/users', { method: 'POST', body: JSON.stringify(body) });
  const location = res.headers.get('location') || '';
  const userId = location.split('/').pop();
  await syncManagedRealmRole(userId, role);
  await upsertUserMenuPermission({
    keycloakUserId: userId,
    username: input.username,
    email: input.email || '',
    role,
    menus: input.menus
  });
  userProfileCache.delete(userId);
  return { id: userId };
}

async function updateUser(userId, input) {
  const existing = await getKeycloakUser(userId);
  if (!existing) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const existingAttrs = existing.attributes || {};
  const nextAttrs = {
    ...existingAttrs,
    ...(input.allowedStoreCodes !== undefined ? { allowedStoreCodes: keycloakSingleValueAttribute(input.allowedStoreCodes) } : {}),
    ...(input.allowedZones !== undefined ? { allowedZones: keycloakSingleValueAttribute(input.allowedZones) } : {})
  };
  delete nextAttrs.menus;
  delete nextAttrs.allowedMenus;
  delete nextAttrs.menuAccess;
  const role = input.role === 'admin' ? 'admin' : 'user';
  const body = {
    ...existing,
    email: input.email !== undefined ? input.email : existing.email,
    firstName: input.firstName !== undefined ? input.firstName : existing.firstName,
    lastName: input.lastName !== undefined ? input.lastName : existing.lastName,
    enabled: input.enabled !== undefined ? !!input.enabled : existing.enabled,
    attributes: nextAttrs
  };

  if (input.menus !== undefined || input.role !== undefined || input.email !== undefined || input.username !== undefined) {
    await upsertUserMenuPermission({
      keycloakUserId: userId,
      username: existing.username,
      email: input.email !== undefined ? input.email : existing.email || '',
      role,
      menus: input.menus
    });
  }
  await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify(body) });
  if (input.role) await syncManagedRealmRole(userId, role);
  if (input.password) {
    await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: input.password, temporary: !!input.temporaryPassword })
    });
  }
  userProfileCache.delete(userId);
  return { id: userId };
}

module.exports = {
  ADMIN_MENUS,
  DEFAULT_MENUS,
  authenticate,
  enforceUserScope,
  requireAdmin,
  requireMenu,
  getPublicConfig,
  buildUser,
  getKeycloakUser,
  listUsers,
  createUser,
  updateUser
};
