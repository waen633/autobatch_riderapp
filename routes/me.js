const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const { getPermissions, upsertUser, DEFAULT_FLAGS } = require('../lib/permissionsDb');

// GET /api/me — return current user profile + permissions
router.get('/', requireAuth, (req, res) => {
  const { id, name, email, username, roles } = req.user;

  // Auto-register user on first visit
  let perms = getPermissions(id);
  if (!perms) {
    // Admin gets all stores by default
    const isAdmin = roles.includes('admin');
    perms = upsertUser(id, {
      displayName: name || username,
      email,
      allowedStores: isAdmin ? '*' : '',
      featureFlags: { ...DEFAULT_FLAGS },
    });
  } else {
    // Update display name/email if changed in Keycloak
    upsertUser(id, { displayName: name || username, email });
    perms = getPermissions(id);
  }

  res.json({
    id,
    name: name || username,
    email,
    username,
    roles,
    allowed_stores: perms.allowed_stores,
    feature_flags: perms.feature_flags,
  });
});

module.exports = router;
