const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { auth } = require('../middleware/auth');
const { getStatistics, getActivationStatus } = require('./smsbower');
const { globalEmitter } = require('./webhook');

// ── Public ──
router.get('/services', (req, res) => { res.json(db.servicesConfig.getAll()); });
router.get('/countries', (req, res) => { res.json(db.simCards.getAll()); });

// ── SSE Stream (public) ──
router.get('/sms/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const onSms = (sms) => { res.write(`data: ${JSON.stringify(sms)}\n\n`); };
  globalEmitter.on('sms', onSms);
  req.on('close', () => { globalEmitter.off('sms', onSms); });
});

// ── Authenticated user routes ──
router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

router.get('/dashboard', auth, (req, res) => {
  const user = req.user;
  const orders = db.orders.getByUser(user.id, 999);
  const completed = orders.filter(o => o.status === 'completed').length;
  const pending = orders.filter(o => o.status === 'pending').length;
  const totalSpent = orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.price, 0);
  res.json({
    balance: user.balance,
    totalOrders: orders.length,
    completedOrders: completed,
    pendingOrders: pending,
    totalSpent: totalSpent.toFixed(2),
  });
});

router.get('/orders', auth, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  res.json(db.orders.getByUser(req.user.id, parseInt(limit), parseInt(offset)));
});

router.get('/transactions', auth, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  res.json(db.transactions.getByUser(req.user.id, parseInt(limit), parseInt(offset)));
});

router.get('/sms', auth, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  res.json(db.smsMessages.getAll(parseInt(limit), parseInt(offset)));
});

router.get('/activations', auth, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  res.json(db.activations.getAll(status, parseInt(limit), offset));
});

router.get('/activations/:id', auth, (req, res) => {
  const act = db.activations.getById(req.params.id);
  if (!act) return res.status(404).json({ error: 'Not found' });
  act.messages = db.smsMessages.getByActivationId(act.activation_id);
  res.json(act);
});

router.get('/activation-status/:activationId', auth, async (req, res) => {
  try {
    const data = await getActivationStatus(process.env.SMSBOWER_API_KEY, req.params.activationId);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/statistics', auth, async (req, res) => {
  try {
    const data = await getStatistics(process.env.SMSBOWER_API_KEY, req.query.countriesIds);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
