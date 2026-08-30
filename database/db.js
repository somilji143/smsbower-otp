const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Railway may use different variable names for the PG connection string
const DATABASE_URL = process.env.DATABASE_URL
  || process.env.DATABASE_PRIVATE_URL
  || process.env.DATABASE_PUBLIC_URL
  || process.env.POSTGRES_URL
  || process.env.PGHOST && `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'railway'}`;

if (!DATABASE_URL) {
  console.error('[DB] ERROR: No DATABASE_URL found. Set DATABASE_URL environment variable.');
  console.error('[DB] On Railway: Add a PostgreSQL service and link it to your web service.');
  console.error('[DB] The variable will be auto-injected after linking.');
  process.exit(1);
}

const isSSL = !DATABASE_URL.includes('localhost') && !DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isSSL ? { rejectUnauthorized: false } : false,
});

let ready = false;
const readyCallbacks = [];

// ── Init ──
(async function initDB() {
  try {
    const client = await pool.connect();
    console.log('[DB] Connected to PostgreSQL');

    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS sim_cards (
      id SERIAL PRIMARY KEY,
      phone TEXT UNIQUE,
      iccid TEXT, imsi TEXT, carrier TEXT, mac TEXT,
      status INTEGER DEFAULT 0,
      active INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS activations (
      id SERIAL PRIMARY KEY,
      activation_id TEXT UNIQUE,
      phone TEXT, service TEXT, country TEXT, operator TEXT,
      status INTEGER DEFAULT 0,
      sum REAL DEFAULT 0, call INTEGER DEFAULT 0, voice INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS sms_messages (
      id SERIAL PRIMARY KEY,
      activation_id TEXT, sender TEXT, recipient TEXT,
      text TEXT, raw_text TEXT, timestamp TEXT,
      pushed INTEGER DEFAULT 0, push_status TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS services_config (
      id SERIAL PRIMARY KEY,
      country TEXT, operator TEXT, service_code TEXT,
      count INTEGER DEFAULT 0, active INTEGER DEFAULT 1
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER, activation_id TEXT,
      service TEXT, country TEXT, operator TEXT,
      phone TEXT, status TEXT DEFAULT 'pending',
      cost REAL DEFAULT 0, price REAL DEFAULT 0, profit REAL DEFAULT 0,
      sms_text TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER, type TEXT,
      amount REAL, balance_after REAL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_code TEXT`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS country_name TEXT`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_name TEXT`);

    client.release();

    // Default settings
    const defaults = {
      profit_percentage: '30',
      min_order_amount: '0.10',
      site_name: 'SMSMaster',
      site_description: 'Virtual Numbers for SMS Verification',
      maintenance_mode: '0',
      refund_timeout: '1200',
      currency_symbol: '$',
    };
    for (const [k, v] of Object.entries(defaults)) {
      const existing = await q1('SELECT key FROM settings WHERE key = $1', [k]);
      if (!existing) await exec('INSERT INTO settings (key, value) VALUES ($1, $2)', [k, v]);
    }

    // Create default admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const existingAdmin = await q1('SELECT id FROM users WHERE role = $1', ['admin']);
    if (!existingAdmin) {
      const hash = bcrypt.hashSync(adminPass, 10);
      await exec('INSERT INTO users (email, password, role, balance) VALUES ($1,$2,$3,$4)',
        [adminEmail, hash, 'admin', 99999]);
      console.log(`[DB] Admin created: ${adminEmail}`);
    }

    ready = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
    console.log('[DB] Ready');
  } catch (err) {
    console.error('[DB] Init failed:', err);
    process.exit(1);
  }
})();

function waitForReady() {
  return new Promise(resolve => { if (ready) return resolve(); readyCallbacks.push(resolve); });
}

// ── Query helpers ──
async function qAll(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}
async function q1(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}
async function exec(sql, params = []) {
  const result = await pool.query(sql, params);
  return { rowCount: result.rowCount };
}
async function execReturning(sql, params = []) {
  const { rows } = await pool.query(sql + ' RETURNING id', params);
  return { id: rows[0]?.id };
}

// ══════════════════════════════════════════════════
module.exports = {
  waitForReady,
  pool,

  users: {
    async create(email, password, role = 'user') {
      const hash = bcrypt.hashSync(password, 10);
      return execReturning('INSERT INTO users (email, password, role) VALUES ($1,$2,$3)', [email, hash, role]);
    },
    async findByEmail(email) { return q1('SELECT * FROM users WHERE email = $1', [email]); },
    async findById(id) { return q1('SELECT id, email, role, balance, status, created_at FROM users WHERE id = $1', [id]); },
    async getAll() { return qAll('SELECT id, email, role, balance, status, created_at FROM users ORDER BY created_at DESC'); },
    async updateBalance(id, amount) {
      await exec('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, id]);
      return q1('SELECT balance FROM users WHERE id = $1', [id]);
    },
    async setBalance(id, balance) { await exec('UPDATE users SET balance = $1 WHERE id = $2', [balance, id]); },
    async setStatus(id, status) { await exec('UPDATE users SET status = $1 WHERE id = $2', [status, id]); },
    async setRole(id, role) { await exec('UPDATE users SET role = $1 WHERE id = $2', [role, id]); },
    verifyPassword(plain, hash) { return bcrypt.compareSync(plain, hash); },
    async count() { return ((await q1('SELECT COUNT(*) as c FROM users')) || {}).c || 0; },
  },

  settings: {
    async get(key) { const r = await q1('SELECT value FROM settings WHERE key = $1', [key]); return r ? r.value : null; },
    async set(key, value) {
      const existing = await q1('SELECT key FROM settings WHERE key = $1', [key]);
      if (existing) await exec('UPDATE settings SET value = $1 WHERE key = $2', [value, key]);
      else await exec('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, value]);
    },
    async getAll() { return qAll('SELECT * FROM settings'); },
  },

  transactions: {
    async create(userId, type, amount, description) {
      const user = await q1('SELECT balance FROM users WHERE id = $1', [userId]);
      const balanceAfter = (user ? user.balance : 0) + amount;
      await exec('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES ($1,$2,$3,$4,$5)',
        [userId, type, amount, balanceAfter, description]);
    },
    async getByUser(userId, limit = 50, offset = 0) {
      return qAll('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    },
    async getAll(limit = 100, offset = 0) {
      return qAll('SELECT t.*, u.email FROM transactions t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    },
  },

  orders: {
    async create(order) {
      const r = await execReturning(
        'INSERT INTO orders (user_id, activation_id, service, country, operator, phone, status, cost, price, profit, expires_at, country_name, service_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [order.user_id, order.activation_id, order.service, order.country, order.operator, order.phone,
         order.status || 'pending', order.cost, order.price, order.profit, order.expires_at || null,
         order.country_name || null, order.service_name || null]
      );
      return r;
    },
    async updateStatus(id, status, smsText) {
      await exec("UPDATE orders SET status = $1, sms_text = COALESCE($2, sms_text), updated_at = NOW() WHERE activation_id = $3",
        [status, smsText || null, String(id)]);
    },
    async setCode(id, code, smsText) {
      await exec('UPDATE orders SET last_code = $1, sms_text = COALESCE($2, sms_text), updated_at = NOW() WHERE id = $3', [code, smsText || null, id]);
    },
    async getById(id) { return q1('SELECT * FROM orders WHERE id = $1', [id]); },
    async getByActivationId(aid) { return q1('SELECT * FROM orders WHERE activation_id = $1', [String(aid)]); },
    async getPending() { return qAll("SELECT * FROM orders WHERE status IN ('pending','active') ORDER BY created_at ASC"); },
    async setStatusById(id, status) {
      await exec('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    },
    async getByUser(userId, limit = 50, offset = 0) {
      return qAll('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    },
    async getAll(limit = 100, offset = 0) {
      return qAll('SELECT o.*, u.email FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    },
    async totalRevenue() {
      return ((await q1("SELECT COALESCE(SUM(profit),0) as total FROM orders WHERE status = 'completed'")) || {}).total || 0;
    },
  },

  simCards: {
    async upsert(sim) {
      const existing = await q1('SELECT id FROM sim_cards WHERE phone = $1', [sim.phone]);
      if (existing) await exec("UPDATE sim_cards SET iccid=$1, imsi=$2, mac=$3, status=$4, active=$5, updated_at=NOW() WHERE phone=$6",
        [sim.iccid, sim.imsi, sim.mac, sim.status, sim.active, sim.phone]);
      else await exec('INSERT INTO sim_cards (phone, iccid, imsi, mac, status, active) VALUES ($1,$2,$3,$4,$5,$6)',
        [sim.phone, sim.iccid, sim.imsi, sim.mac, sim.status, sim.active]);
    },
    async getAll() { return qAll('SELECT * FROM sim_cards ORDER BY updated_at DESC'); },
    async getAvailable() { return q1('SELECT * FROM sim_cards WHERE active = 1 LIMIT 1'); },
    async count() { return ((await q1('SELECT COUNT(*) as c FROM sim_cards')) || {}).c || 0; },
    async activeCount() { return ((await q1('SELECT COUNT(*) as c FROM sim_cards WHERE active = 1')) || {}).c || 0; },
  },

  activations: {
    async create(act) {
      return execReturning('INSERT INTO activations (activation_id, phone, service, country, operator, status, sum, call, voice) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [act.activation_id, act.phone, act.service, act.country, act.operator, act.status, act.sum, act.call, act.voice]);
    },
    async updateStatus(activationId, status) {
      await exec("UPDATE activations SET status=$1, updated_at=NOW() WHERE activation_id=$2", [status, activationId]);
    },
    async getByPhone(phone) { return q1('SELECT * FROM activations WHERE phone = $1 ORDER BY created_at DESC LIMIT 1', [phone]); },
    async getAll(status, limit = 20, offset = 0) {
      if (status !== undefined && status !== '' && status !== null)
        return qAll('SELECT * FROM activations WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [parseInt(status), limit, offset]);
      return qAll('SELECT * FROM activations ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    },
    async getById(id) { return q1('SELECT * FROM activations WHERE activation_id = $1', [id]); },
  },

  smsMessages: {
    async insert(sms) {
      const r = await execReturning('INSERT INTO sms_messages (activation_id, sender, recipient, text, raw_text, timestamp, pushed, push_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [sms.activation_id, sms.sender, sms.recipient, sms.text, sms.raw_text, sms.timestamp, sms.pushed, sms.push_status]);
      return { lastInsertRowid: r.id };
    },
    async getAll(limit = 50, offset = 0) { return qAll('SELECT * FROM sms_messages ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]); },
    async getByActivationId(aid) { return qAll('SELECT * FROM sms_messages WHERE activation_id = $1 ORDER BY created_at DESC', [aid]); },
    async todayCount() { return ((await q1("SELECT COUNT(*) as c FROM sms_messages WHERE created_at::date = CURRENT_DATE")) || {}).c || 0; },
  },

  servicesConfig: {
    async getAll() { return qAll('SELECT * FROM services_config WHERE active = 1'); },
    async getAllIncludingInactive() { return qAll('SELECT * FROM services_config'); },
    async upsert(config) {
      const existing = await q1('SELECT id FROM services_config WHERE country=$1 AND operator=$2 AND service_code=$3', [config.country, config.operator, config.service_code]);
      if (existing) await exec('UPDATE services_config SET count=$1, active=$2 WHERE id=$3', [config.count, config.active !== undefined ? config.active : 1, existing.id]);
      else await exec('INSERT INTO services_config (country, operator, service_code, count, active) VALUES ($1,$2,$3,$4,$5)',
        [config.country, config.operator, config.service_code, config.count, config.active !== undefined ? config.active : 1]);
    },
    async delete(id) { await exec('DELETE FROM services_config WHERE id = $1', [id]); },
  },

  stats: {
    async admin() {
      const [totalUsers, totalSims, activeSims, totalOrders, pendingOrders, completedOrders, todaySms, totalRevenue, totalSales, totalRefunds] = await Promise.all([
        q1("SELECT COUNT(*) as c FROM users WHERE role = 'user'"),
        q1('SELECT COUNT(*) as c FROM sim_cards'),
        q1('SELECT COUNT(*) as c FROM sim_cards WHERE active = 1'),
        q1('SELECT COUNT(*) as c FROM orders'),
        q1("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'"),
        q1("SELECT COUNT(*) as c FROM orders WHERE status = 'completed'"),
        q1("SELECT COUNT(*) as c FROM sms_messages WHERE created_at::date = CURRENT_DATE"),
        q1("SELECT COALESCE(SUM(profit),0) as t FROM orders WHERE status = 'completed'"),
        q1("SELECT COALESCE(SUM(price),0) as t FROM orders WHERE status = 'completed'"),
        q1("SELECT COUNT(*) as c FROM orders WHERE status = 'refunded'"),
      ]);
      return {
        totalUsers: totalUsers?.c || 0, totalSims: totalSims?.c || 0, activeSims: activeSims?.c || 0,
        totalOrders: totalOrders?.c || 0, pendingOrders: pendingOrders?.c || 0, completedOrders: completedOrders?.c || 0,
        todaySms: todaySms?.c || 0, totalRevenue: totalRevenue?.t || 0, totalSales: totalSales?.t || 0,
        totalRefunds: totalRefunds?.c || 0,
      };
    },
  },
};
