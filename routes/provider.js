/* ============================================================
   SmsBower public activation API client (reseller side)
   Docs: https://smsbower.app/api  →  /stubs/handler_api.php
   All catalog data (services, countries, prices) comes from here.
   ============================================================ */

const API_KEY = () => process.env.SMSBOWER_API_KEY || '';

function baseUrls() {
  const urls = [];
  if (process.env.SMSBOWER_BASE_URL) urls.push(process.env.SMSBOWER_BASE_URL);
  urls.push('https://smsbower.online', 'https://smsbower.page');
  return [...new Set(urls)];
}

// ── Low-level call ──
async function callApi(params, { timeout = 20000 } = {}) {
  let lastErr;
  for (const base of baseUrls()) {
    try {
      const url = new URL('/stubs/handler_api.php', base);
      url.searchParams.set('api_key', API_KEY());
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      const text = (await res.text()).trim();
      if (!res.ok && !text) throw new Error(`HTTP ${res.status}`);
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`SmsBower API unreachable: ${lastErr?.message || 'unknown'}`);
}

function parseJson(text, action) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`SmsBower ${action} error: ${text.slice(0, 120)}`); }
  // Auth failures come back as {"status":0,"message":"No access"}
  if (data && data.status === 0 && data.message) {
    throw new Error(`SmsBower: ${data.message} — check SMSBOWER_API_KEY`);
  }
  return data;
}

const ERROR_MESSAGES = {
  BAD_KEY: 'Provider API key is invalid — set SMSBOWER_API_KEY',
  BAD_ACTION: 'Invalid API action',
  BAD_SERVICE: 'Unknown service code',
  BAD_COUNTRY: 'Unknown country',
  NO_NUMBERS: 'No numbers available right now — try another country or tier',
  NO_BALANCE: 'Provider balance is too low — top up your SmsBower account',
  NO_ACTIVATION: 'Activation not found on provider',
  EARLY_CANCEL_DENIED: 'Numbers can be cancelled 2 minutes after purchase',
  BAD_STATUS: 'Invalid status',
};

function friendlyError(code) {
  return ERROR_MESSAGES[code] || `Provider error: ${code}`;
}

// ── Simple TTL cache ──
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit && hit.pending) return hit.pending;
  const pending = fn().then(value => {
    cache.set(key, { at: Date.now(), value });
    return value;
  }).catch(err => {
    cache.delete(key);
    // Serve stale data on upstream failure if we have it
    if (hit) return hit.value;
    throw err;
  });
  cache.set(key, { at: hit?.at || 0, value: hit?.value, pending });
  return pending;
}

// ── Balance:  ACCESS_BALANCE:12.34 ──
async function getBalance() {
  const text = await callApi({ action: 'getBalance' });
  if (text.startsWith('ACCESS_BALANCE:')) return parseFloat(text.split(':')[1]);
  throw new Error(friendlyError(text));
}

// ── Services:  {status:'success', services:[{code,name}]} ──
async function getServices() {
  return cached('services', 6 * 3600e3, async () => {
    const data = parseJson(await callApi({ action: 'getServicesList' }), 'getServicesList');
    const list = data.services || data;
    if (!Array.isArray(list)) throw new Error('Unexpected getServicesList response');
    return list.filter(s => s.code).map(s => ({ code: s.code, name: s.name || s.code }));
  });
}

// ── Countries:  [{id, rus, eng, chn}] or {id: {...}} ──
async function getCountries() {
  return cached('countries', 6 * 3600e3, async () => {
    const data = parseJson(await callApi({ action: 'getCountries' }), 'getCountries');
    const rows = Array.isArray(data) ? data : Object.values(data);
    return rows
      .filter(c => c && c.id !== undefined)
      .map(c => ({ id: String(c.id), name: c.eng || c.rus || String(c.id) }));
  });
}

// ── Prices for one service:  {countryId: {service: {cost, count}}} ──
async function getPricesForService(service) {
  return cached(`prices:${service}`, 90e3, async () => {
    const data = parseJson(await callApi({ action: 'getPrices', service }), 'getPrices');
    const out = {}; // countryId -> { cost, count }
    for (const [country, services] of Object.entries(data)) {
      const entry = services?.[service];
      if (!entry) continue;
      const cost = parseFloat(entry.cost ?? entry.price ?? 0);
      const count = parseInt(entry.count ?? 0);
      if (cost > 0) out[String(country)] = { cost, count };
    }
    return out;
  });
}

/* ── Provider-level prices (tier data) for one service:
   {country: {service: {providerKey: {count, price, provider_id}}}}
   Used to build Gold/Silver/Bronze tiers: within each country the
   providers are sorted by price — top tier (most expensive, usually
   highest quality routes) = gold, middle = silver, cheapest = bronze. ── */
async function getPriceTiersForService(service) {
  return cached(`pricesV3:${service}`, 90e3, async () => {
    const data = parseJson(await callApi({ action: 'getPricesV3', service }), 'getPricesV3');
    const out = {}; // countryId -> [{providerId, price, count}] sorted by price desc
    for (const [country, services] of Object.entries(data)) {
      const entry = services?.[service];
      if (!entry || typeof entry !== 'object') continue;
      const providers = Object.values(entry)
        .map(p => ({
          providerId: String(p.provider_id ?? ''),
          price: parseFloat(p.price ?? 0),
          count: parseInt(p.count ?? 0),
        }))
        .filter(p => p.price > 0 && p.count > 0)
        .sort((a, b) => b.price - a.price);
      if (providers.length) out[String(country)] = providers;
    }
    return out;
  });
}

function tierOf(index, total) {
  if (total <= 1) return 'gold';
  const third = total / 3;
  if (index < third) return 'gold';
  if (index < 2 * third) return 'silver';
  return 'bronze';
}

/* Merge base prices + provider tiers into per-country rows the UI can render.
   Returns [{country, cost, count, tiers: {gold:{cost,count,providerIds}, ...}}] */
async function getCountryOffers(service) {
  const prices = await getPricesForService(service);
  let tiersData = {};
  try { tiersData = await getPriceTiersForService(service); } catch { /* v3 optional */ }

  const countryIds = new Set([...Object.keys(prices), ...Object.keys(tiersData)]);
  const offers = [];
  for (const id of countryIds) {
    const base = prices[id];
    const providers = tiersData[id] || [];
    const tiers = {};
    providers.forEach((p, i) => {
      const t = tierOf(i, providers.length);
      if (!tiers[t]) tiers[t] = { cost: 0, count: 0, providerIds: [] };
      tiers[t].cost = Math.max(tiers[t].cost, p.price);
      tiers[t].count += p.count;
      if (p.providerId) tiers[t].providerIds.push(p.providerId);
    });
    const baseCost = base?.cost ?? Infinity;
    const v3Min = providers.length ? providers.reduce((m, p) => Math.min(m, p.price), Infinity) : Infinity;
    const cost = Math.min(baseCost, v3Min);
    const count = base?.count ?? providers.reduce((s, p) => s + p.count, 0);
    if (!isFinite(cost) || cost <= 0) continue;
    offers.push({ country: id, cost, count, tiers });
  }
  return offers;
}

/* ── Buy a number. Returns
   {activationId, phoneNumber, activationCost, countryCode, activationTime, activationOperator} ── */
async function buyNumber({ service, country, maxPrice, providerIds }) {
  const text = await callApi({
    action: 'getNumberV2',
    service,
    country,
    maxPrice: maxPrice ? String(maxPrice) : undefined,
    providerIds: providerIds?.length ? providerIds.join(',') : undefined,
  });
  if (text.startsWith('{')) {
    const data = parseJson(text, 'getNumberV2');
    if (!data.activationId) throw new Error(friendlyError(JSON.stringify(data)));
    return data;
  }
  // Plain-text errors (NO_NUMBERS, NO_BALANCE, ...) or ACCESS_NUMBER fallback
  if (text.startsWith('ACCESS_NUMBER:')) {
    const [, activationId, phoneNumber] = text.split(':');
    return { activationId, phoneNumber, activationCost: maxPrice || 0 };
  }
  throw new Error(friendlyError(text.split(':')[0]));
}

/* ── Activation status. Returns
   {state: 'waiting'|'retry'|'ok'|'cancelled', code?} ── */
async function getActivationStatus(activationId) {
  const text = await callApi({ action: 'getStatus', id: activationId });
  if (text === 'STATUS_WAIT_CODE') return { state: 'waiting' };
  if (text === 'STATUS_CANCEL') return { state: 'cancelled' };
  if (text.startsWith('STATUS_WAIT_RETRY:')) return { state: 'retry', code: text.slice('STATUS_WAIT_RETRY:'.length) };
  if (text.startsWith('STATUS_OK:')) return { state: 'ok', code: text.slice('STATUS_OK:'.length) };
  throw new Error(friendlyError(text.split(':')[0]));
}

/* ── Change activation status.
   1 = SMS sent, 3 = request another code, 6 = finish, 8 = cancel ── */
async function setActivationStatus(activationId, status) {
  const text = await callApi({ action: 'setStatus', id: activationId, status: String(status) });
  const ok = ['ACCESS_READY', 'ACCESS_RETRY_GET', 'ACCESS_ACTIVATION', 'ACCESS_CANCEL'];
  if (ok.includes(text)) return text;
  const err = new Error(friendlyError(text.split(':')[0]));
  err.code = text.split(':')[0];
  throw err;
}

module.exports = {
  getBalance,
  getServices,
  getCountries,
  getPricesForService,
  getCountryOffers,
  buyNumber,
  getActivationStatus,
  setActivationStatus,
  friendlyError,
};
