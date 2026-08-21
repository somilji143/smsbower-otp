const express = require('express');
const router = express.Router();
const db = require('../database/db');
const crypto = require('crypto');

// POST /partner/api — SmsBower sends requests here
router.post('/api', async (req, res) => {
  try {
    const { action, key } = req.body;

    if (action === 'GET_SERVICES') {
      const services = await db.servicesConfig.getAll();
      const serviceMap = {};
      for (const s of services) {
        if (!serviceMap[s.service_code]) serviceMap[s.service_code] = {};
        if (!serviceMap[s.service_code][s.country]) serviceMap[s.service_code][s.country] = {};
        serviceMap[s.service_code][s.country][s.operator] = s.count;
      }
      return res.json(serviceMap);
    }

    if (action === 'GET_NUMBER') {
      const { service, country, operator, sum, call, voice } = req.body;
      const sim = await db.simCards.getAvailable();
      if (!sim) return res.json({ status: 'NO_NUMBERS' });

      const activationId = crypto.randomUUID();
      await db.activations.create({
        activation_id: activationId, phone: sim.phone,
        service, country, operator, status: 0,
        sum: sum || 0, call: call || 0, voice: voice || 0,
      });

      return res.json({ status: 'SUCCESS', number: sim.phone, activationId });
    }

    if (action === 'FINISH_ACTIVATION') {
      const { activationId, status } = req.body;
      const dbStatus = status === 3 ? 6 : status === 8 ? 8 : status;
      await db.activations.updateStatus(activationId, dbStatus);

      if (dbStatus === 8) {
        await db.orders.updateStatus(activationId, 'canceled', null);
      }
      return res.json({ status: 'SUCCESS' });
    }

    res.json({ status: 'UNKNOWN_ACTION' });
  } catch (e) {
    console.error('[PARTNER] Error:', e);
    res.status(500).json({ status: 'ERROR', message: e.message });
  }
});

module.exports = router;
