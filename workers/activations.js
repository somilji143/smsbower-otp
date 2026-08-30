/* ============================================================
   Activation worker — keeps local orders in sync with SmsBower.

   Refund logic:
   - SmsBower auto-cancels activations after ~20 minutes
   - Our timeout (refund_timeout setting, default 1200s) should be
     <= SmsBower's, so WE cancel first and reclaim the provider cost
   - Every 8s we poll getStatus for all pending orders
   - If expired + no code → cancel upstream (setStatus 8) → refund user
   - If SmsBower already cancelled → we detect STATUS_CANCEL → refund
   - If code arrives before expiry → order completes, no refund
   - Edge cases: EARLY_CANCEL_DENIED (< 2 min old) → retry next tick
                 NO_ACTIVATION (already gone) → refund anyway
   ============================================================ */
const db = require('../database/db');
const provider = require('../routes/provider');

let emitter = null;
const POLL_INTERVAL = 8000;

function emit(order, extra = {}) {
  if (emitter) emitter.emit('activation', {
    orderId: order.id,
    activationId: order.activation_id,
    status: order.status,
    code: order.last_code,
    ...extra,
  });
}

async function refundOrder(order, reason) {
  const fresh = await db.orders.getById(order.id);
  if (!fresh || fresh.status === 'refunded') return;

  await db.orders.setStatusById(order.id, 'refunded');
  await db.users.updateBalance(order.user_id, order.price);
  await db.transactions.create(
    order.user_id, 'refund', order.price,
    reason || `Refund: ${order.service_name || order.service}`
  );
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

async function applyStatus(order, result) {
  if ((result.state === 'ok' || result.state === 'retry') && result.code) {
    if (result.code !== order.last_code) {
      await completeOrder(order, result.code);
    }
    return { ...order, status: 'completed', last_code: result.code };
  }

  if (result.state === 'cancelled') {
    if (order.status !== 'refunded' && order.status !== 'completed' && !order.last_code) {
      await refundOrder(order, `Cancelled by provider: ${order.service_name || order.service}`);
      return { ...order, status: 'refunded' };
    }
  }

  return order;
}

async function cancelAndRefund(order) {
  try {
    await provider.setActivationStatus(order.activation_id, 8);
  } catch (e) {
    const code = e.code || '';
    if (code === 'EARLY_CANCEL_DENIED') {
      return false; // too soon, retry next tick
    }
    if (code !== 'NO_ACTIVATION') {
      // Check if SmsBower already cancelled it
      try {
        const status = await provider.getActivationStatus(order.activation_id);
        if (status.state === 'ok' && status.code) {
          await completeOrder(order, status.code);
          return true;
        }
      } catch {
        // If even getStatus fails, refund anyway — the number is gone
      }
    }
  }

  await refundOrder(order, `Auto-refund: no SMS received for ${order.service_name || order.service}`);
  return true;
}

async function tick() {
  let pending;
  try { pending = await db.orders.getPending(); } catch { return; }

  for (const order of pending) {
    try {
      const isExpired = order.expires_at && new Date(order.expires_at) < new Date();

      if (isExpired) {
        // Code arrived right before expiry — complete, don't refund
        if (order.last_code) {
          await completeOrder(order, order.last_code);
          continue;
        }

        // One final status check before cancelling — code might have just arrived
        try {
          const lastCheck = await provider.getActivationStatus(order.activation_id);
          if ((lastCheck.state === 'ok' || lastCheck.state === 'retry') && lastCheck.code) {
            await completeOrder(order, lastCheck.code);
            continue;
          }
          if (lastCheck.state === 'cancelled') {
            await refundOrder(order, `Auto-refund: activation expired for ${order.service_name || order.service}`);
            continue;
          }
        } catch {
          // Status check failed, proceed with cancel
        }

        await cancelAndRefund(order);
        continue;
      }

      // Not expired yet — just poll for code
      const result = await provider.getActivationStatus(order.activation_id);
      await applyStatus(order, result);
    } catch {
      // Upstream hiccup — retry next tick
    }
  }
}

function start(globalEmitter) {
  emitter = globalEmitter;
  setInterval(tick, POLL_INTERVAL);
  console.log('[WORKER] Activation sync started (polling every 8s)');
}

module.exports = { start, refundOrder, completeOrder, applyStatus };
