const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/permissions.db');

let _db = null;
function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      keycloak_user_id TEXT PRIMARY KEY,
      display_name     TEXT DEFAULT '',
      email            TEXT DEFAULT '',
      allowed_stores   TEXT DEFAULT '',
      feature_flags    TEXT DEFAULT '{}',
      updated_at       INTEGER DEFAULT 0
    )
  `);
  return _db;
}

const DEFAULT_FLAGS = {
  tab_dashboard: true,
  tab_analytics: true,
  section_pending: true,
  section_riders: true,
  section_jobs: true,
  section_stuck: true,
  section_orders: true,
  section_batches: true,
  section_ai_chat: true,
  section_live_map: true,
};

function getPermissions(keycloakUserId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_permissions WHERE keycloak_user_id = ?').get(keycloakUserId);
  if (!row) return null;
  return {
    ...row,
    feature_flags: JSON.parse(row.feature_flags || '{}'),
  };
}

function upsertUser(keycloakUserId, { displayName, email, allowedStores, featureFlags } = {}) {
  const db = getDb();
  const existing = getPermissions(keycloakUserId);
  if (!existing) {
    db.prepare(`
      INSERT INTO user_permissions (keycloak_user_id, display_name, email, allowed_stores, feature_flags, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      keycloakUserId,
      displayName || '',
      email || '',
      allowedStores !== undefined ? allowedStores : '',
      JSON.stringify(featureFlags !== undefined ? featureFlags : DEFAULT_FLAGS),
      Date.now()
    );
  } else {
    // Only update provided fields
    const updates = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (email !== undefined) updates.email = email;
    if (allowedStores !== undefined) updates.allowed_stores = allowedStores;
    if (featureFlags !== undefined) updates.feature_flags = JSON.stringify(featureFlags);
    updates.updated_at = Date.now();

    const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE user_permissions SET ${sets} WHERE keycloak_user_id = ?`)
      .run(...Object.values(updates), keycloakUserId);
  }
  return getPermissions(keycloakUserId);
}

function listUsers() {
  const db = getDb();
  return db.prepare('SELECT * FROM user_permissions ORDER BY display_name').all().map((row) => ({
    ...row,
    feature_flags: JSON.parse(row.feature_flags || '{}'),
  }));
}

function deleteUser(keycloakUserId) {
  const db = getDb();
  db.prepare('DELETE FROM user_permissions WHERE keycloak_user_id = ?').run(keycloakUserId);
}

module.exports = { getPermissions, upsertUser, listUsers, deleteUser, DEFAULT_FLAGS };
