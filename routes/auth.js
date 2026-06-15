const { Router } = require('express');
const {
  authenticate,
  getPublicConfig
} = require('../lib/auth/keycloak');

const router = Router();

router.get('/config', (req, res) => {
  res.json(getPublicConfig());
});

router.get('/me', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    roles: req.user.roles,
    role: req.user.role,
    isAdmin: req.user.isAdmin,
    menus: req.user.menus
  });
});

module.exports = router;
