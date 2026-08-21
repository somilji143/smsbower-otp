const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { auth } = require('../middleware/auth');
const { getStatistics, getActivationStatus } = require('./smsbower');
const { globalEmitter } = require('./webhook');

// ── Public routes (browsable without login) ──
router.get('/services', async (req, res) => { res.json(await db.servicesConfig.getAll()); });
router.get('/countries', async (req, res) => { res.json(await db.simCards.getAll()); });

// ── SSE Stream (public) ──
router.get('/sms/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const onSms = (sms) => { res.write(`data: ${JSON.stringify(sms)}\n\n`); };
  globalEmitter.on('sms', onSms);
  req.on('close', () => { globalEmitter.off('sms', onSms); });
});

// ── Authenticated routes ──
router.get('/me', auth, (req, res) => { res.json(req.user); });

router.get('/dashboard', auth, async (req, res) => {
  const user = req.user;
  const orders = await db.orders.getByUser(user.id, 999);
  const completed = orders.filter(o => o.status === 'completed').length;
  const pending = orders.filter(o => o.status === 'pending').length;
  const refunded = orders.filter(o => o.status === 'refunded').length;
  const totalSpent = orders.filter(o => o.status === 'completed').reduce((s, o) => s + (o.price || 0), 0);
  res.json({ balance: user.balance, totalOrders: orders.length, completedOrders: completed, pendingOrders: pending, refundedOrders: refunded, totalSpent: totalSpent.toFixed(2) });
});

router.get('/orders', auth, async (req, res) => { res.json(await db.orders.getByUser(req.user.id, parseInt(req.query.limit || 50), parseInt(req.query.offset || 0))); });
router.get('/transactions', auth, async (req, res) => { res.json(await db.transactions.getByUser(req.user.id, parseInt(req.query.limit || 50), parseInt(req.query.offset || 0))); });
router.get('/sms', auth, async (req, res) => { res.json(await db.smsMessages.getAll(parseInt(req.query.limit || 50), parseInt(req.query.offset || 0))); });

router.get('/activations', auth, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  res.json(await db.activations.getAll(status, parseInt(limit), (page - 1) * limit));
});

router.get('/activations/:id', auth, async (req, res) => {
  const act = await db.activations.getById(req.params.id);
  if (!act) return res.status(404).json({ error: 'Not found' });
  act.messages = await db.smsMessages.getByActivationId(act.activation_id);
  res.json(act);
});

// Buy number — creates order, deducts balance, sets auto-refund timer
router.post('/buy-number', auth, async (req, res) => {
  try {
    const { service, country } = req.body;
    if (!service || !country) return res.status(400).json({ error: 'Service and country required' });

    const profitPct = parseFloat(await db.settings.get('profit_percentage') || '30');
    const refundTimeout = parseInt(await db.settings.get('refund_timeout') || '600');
    const baseCost = req.body.cost || 0.20;
    const price = +(baseCost * (1 + profitPct / 100)).toFixed(2);
    const profit = +(price - baseCost).toFixed(2);

    // Check balance
    const user = await db.users.findById(req.user.id);
    if (user.balance < price) return res.status(400).json({ error: 'Insufficient balance' });

    // Deduct balance
    await db.users.updateBalance(user.id, -price);
    await db.transactions.create(user.id, 'purchase', -price, `${service} - ${country}`);

    // Create order with expiry for auto-refund
    const expiresAt = new Date(Date.now() + refundTimeout * 1000).toISOString();
    const order = await db.orders.create({
      user_id: user.id,
      activation_id: 'ord-' + Date.now(),
      service, country, operator: req.body.operator || 'any',
      phone: req.body.phone || 'pending',
      status: 'pending', cost: baseCost, price, profit,
      expires_at: expiresAt,
    });

    const updatedUser = await db.users.findById(user.id);
    res.json({ orderId: order.id, price, balance: updatedUser.balance, expiresIn: refundTimeout, message: `Auto-refund in ${Math.floor(refundTimeout / 60)} minutes if no SMS received` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
