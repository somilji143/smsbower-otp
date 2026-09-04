require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./database/db');
const { webhookRouter } = require('./routes/webhook');
const partnerRouter = require('./routes/partner');
const apiRouter = require('./routes/api');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRouter);
app.use('/', webhookRouter);
app.use('/partner', partnerRouter);
app.use('/api', apiRouter);
app.use('/admin/api', adminRouter);

app.get('*', (req, res) => {
  // Don't override actual static files (e.g. admin.html)
  if (req.path.includes('.')) {
    return res.status(404).end();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

db.waitForReady().then(async () => {
  const { globalEmitter } = require('./routes/webhook');
  require('./workers/activations').start(globalEmitter);

  // Seed real-price cache from latest orders so catalog prices are accurate
  const provider = require('./routes/provider');
  try {
    const { rows } = await db.pool.query(
      `SELECT DISTINCT ON (service, country) service, country, cost
       FROM orders WHERE cost > 0 ORDER BY service, country, created_at DESC`
    );
    rows.forEach(r => provider.updateRealPrice(r.service, String(r.country), parseFloat(r.cost)));
    if (rows.length) console.log(`  💰 Price cache: seeded ${rows.length} real prices from order history`);
  } catch (e) { console.warn('[Price cache] seed failed:', e.message); }

  app.listen(PORT, () => {
    console.log('');
    console.log('  ⚡ SMSMaster Platform');
    console.log(`  🌐 App:     http://localhost:${PORT}`);
    console.log(`  👑 Admin:   http://localhost:${PORT}/admin.html`);
    console.log(`  📡 Webhook: http://localhost:${PORT}/api/{apiKey}/webhook`);
    console.log(`  🤝 Partner: http://localhost:${PORT}/partner/api`);
    console.log('');
  });
});
