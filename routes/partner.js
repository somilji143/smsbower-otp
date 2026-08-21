const express = require('express');
const router = express.Router();
const db = require('../database/db');
const crypto = require('crypto');

router.post('/api', (req, res) => {
  const { key, action, country, operator, service, exceptionPhoneSet } = req.body;

  if (key !== process.env.PARTNER_API_KEY) {
    return res.json({ status: 'ERROR', message: 'Invalid key' });
  }

  try {
    if (action === 'GET_SERVICES') {
      const configs = db.servicesConfig.getAll();
      const countryList = [];
      const cMap = {};

      for (const conf of configs) {
        if (!cMap[conf.country]) {
          cMap[conf.country] = { country: conf.country, operatorMap: {} };
          countryList.push(cMap[conf.country]);
        }
        if (!cMap[conf.country].operatorMap[conf.operator]) {
          cMap[conf.country].operatorMap[conf.operator] = {};
        }
        cMap[conf.country].operatorMap[conf.operator][conf.service_code] = conf.count;
      }

      return res.json({ status: 'SUCCESS', countryList });
    }

    if (action === 'GET_NUMBER') {
      const sim = db.simCards.getAvailable(country, operator);
      
      if (!sim) {
        return res.json({ status: 'NO_NUMBERS' });
      }
      
      // Simple exception check
      let isException = false;
      if (Array.isArray(exceptionPhoneSet)) {
        isException = exceptionPhoneSet.some(prefix => sim.phone.startsWith(prefix));
      }
      if (isException) {
         return res.json({ status: 'NO_NUMBERS' });
      }

      const activationId = crypto.randomUUID();
      
      db.activations.create({
        activation_id: activationId,
        phone: sim.phone,
        service: service,
        country: country || 'any',
        operator: operator || 'any',
        status: 0, // wait
        sum: 0, // pricing logic omitted for simplicity
        call: 0,
        voice: 0
      });

      return res.json({
        status: 'SUCCESS',
        number: sim.phone,
        activationId: activationId,
        call: 0,
        voice: 0
      });
    }

    if (action === 'FINISH_ACTIVATION') {
      const { id, status } = req.body; // id is activationId
      let finalStatus = 0;
      if (status === 3) finalStatus = 6;
      else if (status === 8) finalStatus = 8;
      else finalStatus = status;

      db.activations.updateStatus(id, finalStatus);
      return res.json({ status: 'SUCCESS' });
    }

    return res.json({ status: 'ERROR', message: 'Unknown action' });
  } catch (error) {
    console.error('Partner API Error:', error);
    return res.json({ status: 'ERROR', message: 'Internal error' });
  }
});

module.exports = router;
