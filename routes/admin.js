const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { auth, adminOnly } = require('../middleware/auth');

router.use(auth, adminOnly);

router.get('/stats', async (req, res) => { res.json(await db.stats.admin()); });

// Users
router.get('/users', async (req, res) => { res.json(await db.users.getAll()); });

router.patch('/users/:id/balance', async (req, res) => {
  const { amount, description } = req.body;
  if (amount === undefined) return res.status(400).json({ error: 'Amount required' });
  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await db.users.updateBalance(user.id, parseFloat(amount));
  await db.transactions.create(user.id, amount > 0 ? 'deposit' : 'deduction', parseFloat(amount), description || (amount > 0 ? 'Admin deposit' : 'Admin deduction'));
  res.json(await db.users.findById(user.id));
});

router.patch('/users/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['active', 'banned', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await db.users.setStatus(req.params.id, status);
  res.json({ success: true });
});

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await db.users.setRole(req.params.id, role);
  res.json({ success: true });
});

// Settings
router.get('/settings', async (req, res) => {
  const all = await db.settings.getAll();
  const obj = {};
  all.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
});

router.post('/settings', async (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    await db.settings.set(key, String(value));
  }
  res.json({ success: true });
});

// Orders, Transactions, SIMs, SMS, Services
router.get('/orders', async (req, res) => { res.json(await db.orders.getAll(parseInt(req.query.limit || 100), parseInt(req.query.offset || 0))); });
router.get('/transactions', async (req, res) => { res.json(await db.transactions.getAll(parseInt(req.query.limit || 100), parseInt(req.query.offset || 0))); });
router.get('/sims', async (req, res) => { res.json(await db.simCards.getAll()); });
router.get('/sms', async (req, res) => { res.json(await db.smsMessages.getAll(parseInt(req.query.limit || 100), parseInt(req.query.offset || 0))); });
router.get('/services', async (req, res) => { res.json(await db.servicesConfig.getAllIncludingInactive()); });
router.post('/services', async (req, res) => { try { await db.servicesConfig.upsert(req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/services/:id', async (req, res) => { await db.servicesConfig.delete(req.params.id); res.json({ success: true }); });

// Test SMS
router.post('/test-sms', async (req, res) => {
  const { globalEmitter } = require('./webhook');
  const sender = req.body.sender || 'TestSender';
  const text = req.body.text || 'Test code: 1234';
  const smsRecord = { activation_id: 'test-' + Date.now(), sender, recipient: req.body.recipient || '+10000000000', text, raw_text: Buffer.from(text).toString('base64'), timestamp: new Date().toISOString(), pushed: 0, push_status: 'TEST' };
  const result = await db.smsMessages.insert(smsRecord);
  smsRecord.id = result.lastInsertRowid;
  globalEmitter.emit('sms', smsRecord);
  res.json(smsRecord);
});

module.exports = router;
