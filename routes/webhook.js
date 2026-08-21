const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { pushSms } = require('./smsbower');
const EventEmitter = require('events');
const globalEmitter = new EventEmitter();

// Attach global emitter to router for now
router.emitter = globalEmitter;

router.post('/api/:apiKey/webhook', async (req, res) => {
  const { apiKey } = req.params;
  
  if (apiKey !== process.env.PARTNER_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type } = req.body;

  try {
    if (type === 'dev-status') {
      const { status } = req.body; // array
      if (Array.isArray(status)) {
        for (const sim of status) {
          db.simCards.upsert({
            phone: sim.sn || sim.phone,
            iccid: sim.iccid,
            imsi: sim.imsi,
            mac: sim.mac || req.body.mac,
            status: sim.st,
            active: sim.active ? 1 : 0
          });
        }
      }
      return res.json({ status: 'ok' });
    }

    if (type === 'recv-sms') {
      const { sms } = req.body;
      if (Array.isArray(sms)) {
        for (const s of sms) {
          // [portIndex, slotIndex, datetime, senderName, recipientPhone, base64Text]
          const sender = s[3];
          const recipient = s[4];
          const rawText = s[5];
          const text = Buffer.from(rawText, 'base64').toString('utf8');
          const datetime = s[2];

          // Try to find activation
          const activation = db.activations.getByPhone(recipient);
          const activationId = activation ? activation.activation_id : null;
          
          let pushed = 0;
          let pushStatus = '';

          if (activation) {
            // Push to smsbower
            const pushResult = await pushSms({
              key: process.env.PARTNER_API_KEY,
              smsId: Date.now().toString(), // dummy id
              phone: recipient,
              phoneFrom: sender,
              text,
              call: activation.call,
              voice: activation.voice
            });
            pushed = pushResult.success ? 1 : 0;
            pushStatus = pushResult.success ? 'SUCCESS' : 'FAILED';
          }

          const smsRecord = {
            activation_id: activationId,
            sender,
            recipient,
            text,
            raw_text: rawText,
            timestamp: datetime,
            pushed,
            push_status: pushStatus
          };

          const result = db.smsMessages.insert(smsRecord);
          smsRecord.id = result.lastInsertRowid;
          
          // Broadcast SSE
          router.emitter.emit('sms', smsRecord);
        }
      }
      return res.json({ status: 'ok' });
    }

    return res.status(400).json({ error: 'Unknown type' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = { webhookRouter: router, globalEmitter };
