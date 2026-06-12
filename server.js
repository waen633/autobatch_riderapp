require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

app.use('/api', require('./routes/pending'));
app.use('/api', require('./routes/jobs'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/riders'));
app.use('/api', require('./routes/performance'));
app.use('/api', require('./routes/dispatch'));
app.use('/api', require('./routes/diagnostics'));
app.use('/api', require('./routes/analytics'));
app.use('/api', require('./routes/storeConfig'));
app.use('/api', require('./routes/zones'));
app.use('/api', require('./routes/tiktok'));
app.use('/api/ai', require('./routes/ai'));

const { startSyncScheduler } = require('./sync/sheetsSync');
startSyncScheduler();

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
