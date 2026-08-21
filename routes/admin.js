const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { auth, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(auth, adminOnly);

// ── Dashboard Stats ──
router.get('/stats', (req, res) => {
  res.json(db.stats.admin());
});

// ── Users Management ──
router.get('/users', (req, res) => {
  res.json(db.users.getAll());
});

router.patch('/users/:id/balance', (req, res) => {
  const { amount, description } = req.body;
  if (amount === undefined) return res.status(400).json({ error: 'Amount required' });
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.users.updateBalance(user.id, parseFloat(amount));
  db.transactions.create(user.id, amount > 0 ? 'deposit' : 'deduction', parseFloat(amount), description || (amount > 0 ? 'Admin deposit' : 'Admin deduction'));
  const updated = db.users.findById(user.id);
  res.json(updated);
});

router.patch('/users/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'banned', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.users.setStatus(req.params.id, status);
  res.json({ success: true });
});

router.patch('/users/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  db.users.setRole(req.params.id, role);
  res.json({ success: true });
});

// ── Settings (Profit %, etc.) ──
router.get('/settings', (req, res) => {
  const all = db.settings.getAll();
  const obj = {};
  all.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
});

router.post('/settings', (req, res) => {
  const entries = req.body;
  for (const [key, value] of Object.entries(entries)) {
    db.settings.set(key, String(value));
  }
  res.json({ success: true });
});

// ── Orders ──
router.get('/orders', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  res.json(db.orders.getAll(parseInt(limit), parseInt(offset)));
});

// ── Transactions ──
router.get('/transactions', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  res.json(db.transactions.getAll(parseInt(limit), parseInt(offset)));
});

// ── SIM Cards ──
router.get('/sims', (req, res) => {
  res.json(db.simCards.getAll());
});

// ── SMS Messages ──
router.get('/sms', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  res.json(db.smsMessages.getAll(parseInt(limit), parseInt(offset)));
});

// ── Services Config ──
router.get('/services', (req, res) => {
  res.json(db.servicesConfig.getAllIncludingInactive());
});

router.post('/services', (req, res) => {
  try {
    db.servicesConfig.upsert(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/services/:id', (req, res) => {
  db.servicesConfig.delete(req.params.id);
  res.json({ success: true });
});

// ── Activations ──
router.get('/activations', (req, res) => {
  const { status, limit = 100, offset = 0 } = req.query;
  res.json(db.activations.getAll(status, parseInt(limit), parseInt(offset)));
});

// ── Test SMS ──
router.post('/test-sms', (req, res) => {
  const { globalEmitter } = require('./webhook');
  const sender = req.body.sender || 'TestSender';
  const text = req.body.text || 'Test code: 1234';
  const smsRecord = {
    activation_id: 'test-' + Date.now(),
    sender, recipient: req.body.recipient || '+10000000000',
    text, raw_text: Buffer.from(text).toString('base64'),
    timestamp: new Date().toISOString(), pushed: 0, push_status: 'TEST'
  };
  const result = db.smsMessages.insert(smsRecord);
  smsRecord.id = result.lastInsertRowid;
  globalEmitter.emit('sms', smsRecord);
  res.json(smsRecord);
});

module.exports = router;
