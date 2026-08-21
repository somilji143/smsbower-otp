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

// Routes
app.use('/auth', authRouter);
app.use('/', webhookRouter);
app.use('/partner', partnerRouter);
app.use('/api', apiRouter);
app.use('/admin', adminRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

db.waitForReady().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ⚡ SmsBower OTP Platform');
    console.log(`  🌐 App:     http://localhost:${PORT}`);
    console.log(`  👑 Admin:   http://localhost:${PORT}/admin.html`);
    console.log(`  📡 Webhook: http://localhost:${PORT}/api/{apiKey}/webhook`);
    console.log(`  🤝 Partner: http://localhost:${PORT}/partner/api`);
    console.log('');
  });
});
