/* ============================================================
   Activation worker — keeps local orders in sync with SmsBower.
   - Polls status of pending orders (catches codes even if the
     client is offline) and stores received codes
   - Cancels + refunds expired orders upstream (setStatus 8)
   - Emits 'activation' events on the global SSE emitter
   ============================================================ */
const db = require('../database/db');
const provider = require('../routes/provider');

let emitter = null;
const POLL_INTERVAL = 8000;

function emit(order, extra = {}) {
  if (emitter) emitter.emit('activation', { orderId: order.id, activationId: order.activation_id, status: order.status, code: order.last_code, ...extra });
}

async function refundOrder(order, reason) {
  await db.orders.setStatusById(order.id, 'refunded');
  await db.users.updateBalance(order.user_id, order.price);
  await db.transactions.create(order.user_id, 'refund', order.price, reason || `Refund: ${order.service_name || order.service}`);
  console.log(`[WORKER] Order #${order.id} refunded $${order.price}`);
  emit({ ...order, status: 'refunded' });
}

async function completeOrder(order, code, smsText) {
  if (code) await db.orders.setCode(order.id, code, smsText);
  if (order.status !== 'completed') {
    await db.orders.setStatusById(order.id, 'completed');
    console.log(`[WORKER] Order #${order.id} completed, code: ${code}`);
  }
  emit({ ...order, status: 'completed', last_code: code });
}

/* Apply an upstream status result to a local order. Shared with the
   user-facing status endpoint so both paths behave identically. */
async function applyStatus(order, result) {
  if ((result.state === 'ok' || result.state === 'retry') && result.code && result.code !== order.last_code) {
    await completeOrder(order, result.code);
    return { ...order, status: 'completed', last_code: result.code };
  }
  if (result.state === 'cancelled' && order.status !== 'refunded' && order.status !== 'completed' && !order.last_code) {
    await refundOrder(order, `Activation cancelled: ${order.service_name || order.service}`);
    return { ...order, status: 'refunded' };
  }
  return order;
}

async function tick() {
  let pending;
  try { pending = await db.orders.getPending(); } catch { return; }
  for (const order of pending) {
    try {
      const expired = order.expires_at && new Date(order.expires_at) < new Date();
      if (expired) {
        if (order.last_code) { await completeOrder(order, order.last_code); continue; }
        try {
          await provider.setActivationStatus(order.activation_id, 8);
          await refundOrder(order, `Auto-refund: no SMS received for ${order.service_name || order.service}`);
        } catch (e) {
          if (e.code === 'EARLY_CANCEL_DENIED') continue; // retry next tick
          if (e.code === 'NO_ACTIVATION') await refundOrder(order, 'Auto-refund: activation expired');
          else console.error(`[WORKER] Cancel failed for #${order.id}:`, e.message);
        }
        continue;
      }
      const result = await provider.getActivationStatus(order.activation_id);
      await applyStatus(order, result);
    } catch (e) {
      // Upstream hiccup — retry next tick
    }
  }
}

function start(globalEmitter) {
  emitter = globalEmitter;
  setInterval(tick, POLL_INTERVAL);
  console.log('[WORKER] Activation sync started');
}

module.exports = { start, refundOrder, completeOrder, applyStatus };
