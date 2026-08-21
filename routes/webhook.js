const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { pushSms } = require('./smsbower');
const EventEmitter = require('events');

const globalEmitter = new EventEmitter();
globalEmitter.setMaxListeners(100);

// POST /api/:apiKey/webhook — from GSM modem
router.post('/api/:apiKey/webhook', async (req, res) => {
  try {
    const { type, mac, status: simStatus, sms } = req.body;

    if (type === 'dev-status' && Array.isArray(simStatus)) {
      for (const sim of simStatus) {
        await db.simCards.upsert({
          phone: sim.sn, iccid: sim.iccid, imsi: sim.imsi,
          mac, status: sim.st, active: sim.active ? 1 : 0,
        });
      }
      console.log(`[WEBHOOK] dev-status: ${simStatus.length} SIMs updated`);
    }

    if (type === 'recv-sms' && Array.isArray(sms)) {
      for (const msg of sms) {
        const [portIndex, slotIndex, datetime, senderName, recipientPhone, base64Text] = msg;
        const text = Buffer.from(base64Text || '', 'base64').toString('utf-8');
        const activation = await db.activations.getByPhone(recipientPhone);

        const smsRecord = {
          activation_id: activation?.activation_id || null,
          sender: senderName, recipient: recipientPhone, text,
          raw_text: base64Text, timestamp: datetime,
          pushed: 0, push_status: '',
        };
        const result = await db.smsMessages.insert(smsRecord);
        smsRecord.id = result.lastInsertRowid;
        globalEmitter.emit('sms', smsRecord);

        // Push SMS to upstream provider
        if (activation) {
          try {
            await pushSms(process.env.SMSBOWER_API_KEY, activation.activation_id, recipientPhone, text);
            smsRecord.push_status = 'SUCCESS';
            // Mark order completed
            await db.orders.updateStatus(activation.activation_id, 'completed', text);
          } catch (e) {
            smsRecord.push_status = 'FAILED';
            console.error('[WEBHOOK] Push failed:', e.message);
          }
        }
        console.log(`[WEBHOOK] recv-sms: ${senderName} -> ${recipientPhone}`);
      }
    }

    res.json({ status: 'ok' });
  } catch (e) {
    console.error('[WEBHOOK] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { webhookRouter: router, globalEmitter };
