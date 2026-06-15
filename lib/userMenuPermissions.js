const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'app-permissions.sqlite');
const TABLE_NAME = 'user_role_permissions';
const DEFAULT_MENUS = ['dashboard', 'dispatcher', 'analytics', 'aiChat', 'routeTools'];
const ADMIN_MENUS = [...DEFAULT_MENUS, 'admin'];

let db = null;

function parseCsv(value) {
  if (Array.isArray(value)) return value.flatMap(parseCsv);
  if (value == null) return [];
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'user';
}

function sanitizeMenus(menus, role = 'user') {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'admin') return [...ADMIN_MENUS];

  const allowed = new Set(DEFAULT_MENUS);
  const seen = new Set();
  const filtered = parseCsv(menus).filter(menu => {
    if (!allowed.has(menu) || seen.has(menu)) return false;
    seen.add(menu);
    return true;
  });
  return filtered.length ? filtered : ['dashboard'];
}

function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      keycloakUserId TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'user',
      menus TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  return db;
}

function rowToPermission(row) {
  if (!row) return null;
  let menus = [];
  try {
    menus = JSON.parse(row.menus || '[]');
  } catch {
    menus = [];
  }
  return {
    keycloakUserId: row.keycloakUserId,
    role: normalizeRole(row.role),
    menus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function getUserMenuPermission(keycloakUserId) {
  if (!keycloakUserId) return null;
  const row = getDb()
    .prepare(`SELECT * FROM ${TABLE_NAME} WHERE keycloakUserId = ?`)
    .get(keycloakUserId);
  return rowToPermission(row);
}

async function getUserMenuPermissionMap(keycloakUserIds = []) {
  const ids = [...new Set(keycloakUserIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT * FROM ${TABLE_NAME} WHERE keycloakUserId IN (${placeholders})`)
    .all(...ids);
  return new Map(rows.map(row => {
    const permission = rowToPermission(row);
    return [permission.keycloakUserId, permission];
  }));
}

function buildEffectivePermission(user, permission) {
  const role = user.isAdmin ? 'admin' : normalizeRole(permission?.role);
  return {
    keycloakUserId: user.id,
    role,
    menus: sanitizeMenus(permission?.menus, role)
  };
}

async function applyMenuPermission(user) {
  let permission = null;
  try {
    permission = await getUserMenuPermission(user.id);
  } catch (e) {
    console.error('[userMenuPermissions] unable to load permission, using role default:', e.message);
  }
  const effective = buildEffectivePermission(user, permission);
  return {
    ...user,
    role: effective.role,
    menus: effective.menus
  };
}

async function upsertUserMenuPermission(input = {}) {
  if (!input.keycloakUserId) {
    const err = new Error('keycloakUserId required');
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const role = normalizeRole(input.role);
  const menus = sanitizeMenus(input.menus, role);
  const existing = await getUserMenuPermission(input.keycloakUserId);

  getDb().prepare(`
    INSERT INTO ${TABLE_NAME} (
      keycloakUserId,
      role,
      menus,
      createdAt,
      updatedAt
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(keycloakUserId) DO UPDATE SET
      role = excluded.role,
      menus = excluded.menus,
      updatedAt = excluded.updatedAt
  `).run(
    input.keycloakUserId,
    role,
    JSON.stringify(menus),
    existing?.createdAt || now,
    now
  );

  return getUserMenuPermission(input.keycloakUserId);
}

module.exports = {
  ADMIN_MENUS,
  DEFAULT_MENUS,
  applyMenuPermission,
  buildEffectivePermission,
  getUserMenuPermissionMap,
  sanitizeMenus,
  upsertUserMenuPermission
};
