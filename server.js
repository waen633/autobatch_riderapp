require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(cors({ origin: process.env.APP_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

// Session (needed for OAuth callback token storage)
app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme-use-long-random-string',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

// Static files — served before auth so login.html is accessible
app.use(express.static(path.join(__dirname, 'public')));

// ─── Public routes (no auth) ──────────────────────────────────
app.use('/api/auth', require('./routes/authRoute'));

// ─── Auth middleware for all /api/* below ────────────────────
const { requireAuth } = require('./lib/auth');

// Token bridge: frontend reads token from session via /api/auth/token (already mounted above)
// All other /api/* require Bearer token
app.use('/api', (req, res, next) => {
  // If request comes from session (server-side), inject token from session
  if (!req.headers['authorization'] && req.session && req.session.accessToken) {
    req.headers['authorization'] = `Bearer ${req.session.accessToken}`;
  }
  next();
});

// Store access check middleware
const { getPermissions } = require('./lib/permissionsDb');
function storeAccessCheck(req, res, next) {
  // Only check if storeCode is provided and user is loaded
  if (!req.user) return next();
  const storeCode = req.query.storeCode || req.body?.storeCode;
  if (!storeCode) return next();

  const perms = getPermissions(req.user.id);
  if (!perms) return next(); // not yet registered, allow (me route will register)
  if (perms.allowed_stores === '*' || perms.allowed_stores === '') return next(); // admin or unset
  if (req.user.roles.includes('admin')) return next();

  const allowed = perms.allowed_stores.split(',').map((s) => s.trim());
  const requested = storeCode.split(',').map((s) => s.trim());
  const denied = requested.filter((s) => !allowed.includes(s));
  if (denied.length > 0) {
    return res.status(403).json({ error: `Access denied to store(s): ${denied.join(', ')}` });
  }
  next();
}

// /api/me และ /api/admin — ต้อง auth เสมอ (admin route มี requireAdmin ข้างใน)
app.use('/api/me', requireAuth, require('./routes/me'));
app.use('/api/admin', require('./routes/admin'));

// routes อื่นทั้งหมด — auth + store access check
app.use('/api', requireAuth, storeAccessCheck);
app.use('/api', require('./routes/pending'));
app.use('/api', require('./routes/jobs'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/riders'));
app.use('/api', require('./routes/performance'));
app.use('/api', require('./routes/diagnostics'));
app.use('/api', require('./routes/analytics'));
app.use('/api', require('./routes/storeConfig'));
app.use('/api/ai', require('./routes/ai'));

const { startSyncScheduler } = require('./sync/sheetsSync');
startSyncScheduler();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
