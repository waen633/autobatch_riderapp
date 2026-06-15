const { Router } = require('express');
const {
  createUser,
  listUsers,
  requireAdmin,
  updateUser
} = require('../lib/auth/keycloak');

const router = Router();

router.use(requireAdmin);

router.get('/users', async (req, res) => {
  try {
    const users = await listUsers(req.query.search || '');
    res.json({ count: users.length, data: users });
  } catch (e) {
    console.error('[/api/admin/users]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    if (!req.body.username) return res.status(400).json({ error: 'username required' });
    const result = await createUser(req.body);
    res.status(201).json(result);
  } catch (e) {
    console.error('[/api/admin/users]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const result = await updateUser(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    console.error('[/api/admin/users/:id]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
