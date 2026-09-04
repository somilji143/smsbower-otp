const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { auth } = require('../middleware/auth');
const provider = require('./provider');
const { isoForCountry } = require('../data/countries');
const { iconUrl } = require('../data/service-icons');
const worker = require('../workers/activations');
const { globalEmitter } = require('./webhook');

async function convertCost(rubAmount) {
  const rate = parseFloat(await db.settings.get('rub_to_usd_rate') || '90');
  return rubAmount / rate;
}

async function sellPrice(costUsd) {
  const pct = parseFloat(await db.settings.get('profit_percentage') || '30');
  const raw = costUsd * (1 + pct / 100);
  return Math.round(raw * 10000) / 10000;
}

/* ══════════ PUBLIC CATALOG (real data from SmsBower) ══════════ */

// All services, with logos — browsable without login
router.get('/catalog/services', async (req, res) => {
  try {
    const services = await provider.getServices();
    res.json(services.map(s => ({ ...s, logo: iconUrl(s.code) })));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// All countries with ISO codes for flags
router.get('/catalog/countries', async (req, res) => {
  try {
    const countries = await provider.getCountries();
    res.json(countries.map(c => ({ ...c, iso: isoForCountry(c.name) })));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Real per-country offers for one service: price (with margin), stock, Gold/Silver/Bronze tiers
router.get('/catalog/offers', async (req, res) => {
  try {
    const service = String(req.query.service || '').trim();
    if (!service) return res.status(400).json({ error: 'service required' });

    const [offers, countries] = await Promise.all([
      provider.getCountryOffers(service),
      provider.getCountries().catch(() => []),
    ]);
    const nameById = Object.fromEntries(countries.map(c => [c.id, c.name]));
    const pct = parseFloat(await db.settings.get('profit_percentage') || '30');
    const rate = parseFloat(await db.settings.get('rub_to_usd_rate') || '90');
    const sell = c => Math.round((c / rate) * (1 + pct / 100) * 10000) / 10000;

    const rows = offers.map(o => {
      const name = nameById[o.country] || o.country;
      const tiers = {};
      for (const [rank, t] of Object.entries(o.tiers || {})) {
        tiers[rank] = { price: sell(t.cost), count: t.count };
      }
      return { country: o.country, name, iso: isoForCountry(name), price: sell(o.cost), count: o.count, tiers };
    }).sort((a, b) => b.count - a.count);

    res.json(rows);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/* ══════════ SSE STREAM (sms + activation updates) ══════════ */
router.get('/sms/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(': connected\n\n');
  const onSms = (sms) => res.write(`event: sms\ndata: ${JSON.stringify(sms)}\n\n`);
  const onActivation = (a) => res.write(`event: activation\ndata: ${JSON.stringify(a)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  globalEmitter.on('sms', onSms);
  globalEmitter.on('activation', onActivation);
  req.on('close', () => {
    clearInterval(ping);
    globalEmitter.off('sms', onSms);
    globalEmitter.off('activation', onActivation);
  });
});

/* ══════════ AUTHENTICATED ══════════ */
router.get('/me', auth, (req, res) => { res.json(req.user); });

router.get('/dashboard', auth, async (req, res) => {
  const orders = await db.orders.getByUser(req.user.id, 999);
  const completed = orders.filter(o => o.status === 'completed').length;
  const pending = orders.filter(o => o.status === 'pending').length;
  const refunded = orders.filter(o => o.status === 'refunded').length;
  const totalSpent = orders.filter(o => o.status === 'completed').reduce((s, o) => s + (o.price || 0), 0);
  res.json({ balance: req.user.balance, totalOrders: orders.length, completedOrders: completed, pendingOrders: pending, refundedOrders: refunded, totalSpent: totalSpent.toFixed(2) });
});

router.get('/orders', auth, async (req, res) => { res.json(await db.orders.getByUser(req.user.id, parseInt(req.query.limit || 50), parseInt(req.query.offset || 0))); });
router.get('/transactions', auth, async (req, res) => { res.json(await db.transactions.getByUser(req.user.id, parseInt(req.query.limit || 50), parseInt(req.query.offset || 0))); });
router.get('/sms', auth, async (req, res) => { res.json(await db.smsMessages.getAll(parseInt(req.query.limit || 50), parseInt(req.query.offset || 0))); });

/* ── Buy a real number from SmsBower ── */
router.post('/buy-number', auth, async (req, res) => {
  try {
    const { service, country, rank } = req.body;
    if (!service || !country) return res.status(400).json({ error: 'Service and country required' });

    // Look up the live offer to estimate cost + resolve tier providers
    const offers = await provider.getCountryOffers(service);
    const offer = offers.find(o => o.country === String(country));
    if (!offer) return res.status(400).json({ error: 'No numbers available for this service/country' });

    let baseCost = offer.cost;
    let providerIds;
    if (rank && offer.tiers?.[rank]) {
      baseCost = offer.tiers[rank].cost ?? offer.tiers[rank].price ?? baseCost;
      providerIds = offer.tiers[rank].providerIds;
    }
    const maxCost = Math.ceil(baseCost * 1.2 * 100) / 100; // small headroom so the buy doesn't fail on price drift
    const maxCostUsd = await convertCost(maxCost);
    const maxPrice = await sellPrice(maxCostUsd);

    const user = await db.users.findById(req.user.id);
    if (user.balance < maxPrice) {
      return res.status(400).json({ error: `Insufficient balance — this number costs up to $${maxPrice.toFixed(4)}` });
    }

    // Real purchase
    const bought = await provider.buyNumber({ service, country, maxPrice: maxCost, providerIds });
    const actualCostRub = parseFloat(bought.activationCost || baseCost) || baseCost;
    const actualCostUsd = await convertCost(actualCostRub);
    const price = await sellPrice(actualCostUsd);
    const profit = +(price - actualCostUsd).toFixed(2);

    await db.users.updateBalance(user.id, -price);

    const countries = await provider.getCountries().catch(() => []);
    const services = await provider.getServices().catch(() => []);
    const countryName = countries.find(c => c.id === String(country))?.name || String(country);
    const serviceName = services.find(s => s.code === service)?.name || service;

    await db.transactions.create(user.id, 'purchase', -price, `${serviceName} — ${countryName} (+${bought.phoneNumber})`);

    const lifetime = parseInt(await db.settings.get('refund_timeout') || '1200');
    const expiresAt = new Date(Date.now() + lifetime * 1000).toISOString();
    const order = await db.orders.create({
      user_id: user.id,
      activation_id: String(bought.activationId),
      service, country: String(country),
      operator: bought.activationOperator || rank || 'any',
      phone: String(bought.phoneNumber),
      status: 'pending', cost: actualCostUsd, price, profit,
      expires_at: expiresAt,
      country_name: countryName, service_name: serviceName,
    });

    const updatedUser = await db.users.findById(user.id);
    res.json({
      orderId: order.id, activationId: bought.activationId, phone: String(bought.phoneNumber),
      price, balance: updatedUser.balance, expiresAt, expiresIn: lifetime,
      service, serviceName, country: String(country), countryName,
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

async function ownOrder(req, res) {
  const order = await db.orders.getById(req.params.id);
  if (!order || (order.user_id !== req.user.id && req.user.role !== 'admin')) {
    res.status(404).json({ error: 'Order not found' });
    return null;
  }
  return order;
}

// Poll status of an activation (proxies SmsBower getStatus)
router.get('/orders/:id/status', auth, async (req, res) => {
  try {
    const order = await ownOrder(req, res);
    if (!order) return;
    if (order.status === 'refunded' || order.status === 'finished') return res.json(order);
    const result = await provider.getActivationStatus(order.activation_id);
    const updated = await worker.applyStatus(order, result);
    res.json({ ...updated, upstream: result.state });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Cancel a number (only allowed 2+ min after purchase, per provider rules) → full refund
router.post('/orders/:id/cancel', auth, async (req, res) => {
  try {
    const order = await ownOrder(req, res);
    if (!order) return;
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order cannot be cancelled' });
    if (order.last_code) return res.status(400).json({ error: 'Code already received — cannot cancel' });
    await provider.setActivationStatus(order.activation_id, 8);
    await worker.refundOrder(order, `Cancelled: ${order.service_name || order.service}`);
    const user = await db.users.findById(req.user.id);
    res.json({ success: true, balance: user.balance });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Request another SMS on the same number (free, status 3)
router.post('/orders/:id/retry', auth, async (req, res) => {
  try {
    const order = await ownOrder(req, res);
    if (!order) return;
    await provider.setActivationStatus(order.activation_id, 3);
    await db.orders.setStatusById(order.id, 'pending');
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Finish activation (status 6)
router.post('/orders/:id/finish', auth, async (req, res) => {
  try {
    const order = await ownOrder(req, res);
    if (!order) return;
    await provider.setActivationStatus(order.activation_id, 6).catch(() => {});
    await db.orders.setStatusById(order.id, order.last_code ? 'completed' : 'finished');
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Active (pending) orders for the current user — for restoring UI state
router.get('/active-orders', auth, async (req, res) => {
  const orders = await db.orders.getByUser(req.user.id, 50);
  res.json(orders.filter(o => o.status === 'pending' || (o.status === 'completed' && o.expires_at && new Date(o.expires_at) > new Date())));
});

module.exports = router;
