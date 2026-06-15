require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { authenticate, enforceUserScope, requireMenu } = require('./lib/auth/keycloak');

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

app.use('/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/auth'));

app.use('/api', authenticate);
app.use('/api', enforceUserScope);
app.use('/api/admin', require('./routes/admin'));
app.use('/api', requireMenu('dashboard'), require('./routes/pending'));
app.use('/api', requireMenu('dashboard'), require('./routes/jobs'));
app.use('/api', requireMenu('dashboard'), require('./routes/orders'));
app.use('/api', requireMenu('dashboard'), require('./routes/riders'));
app.use('/api', requireMenu('analytics'), require('./routes/performance'));
app.use('/api', requireMenu('dispatcher'), require('./routes/dispatch'));
app.use('/api', requireMenu('dashboard'), require('./routes/diagnostics'));
app.use('/api', requireMenu('analytics'), require('./routes/analytics'));
app.use('/api', requireMenu('dashboard'), require('./routes/storeConfig'));
app.use('/api', requireMenu('dashboard'), require('./routes/zones'));
app.use('/api', requireMenu('dashboard'), require('./routes/tiktok'));
app.use('/api/ai', requireMenu('aiChat'), require('./routes/ai'));


app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
