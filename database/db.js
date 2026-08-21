const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'smsbower.db');

let db = null;
let ready = false;
const readyCallbacks = [];

// ── Init ──
(async function initDB() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
      console.log('[DB] Loaded existing database');
    } else {
      db = new SQL.Database();
      console.log('[DB] Created new database');
    }

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sim_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      iccid TEXT, imsi TEXT, carrier TEXT, mac TEXT,
      status INTEGER DEFAULT 0,
      active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activation_id TEXT UNIQUE,
      phone TEXT, service TEXT, country TEXT, operator TEXT,
      status INTEGER DEFAULT 0,
      sum REAL DEFAULT 0, call INTEGER DEFAULT 0, voice INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sms_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activation_id TEXT, sender TEXT, recipient TEXT,
      text TEXT, raw_text TEXT, timestamp TEXT,
      pushed INTEGER DEFAULT 0, push_status TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS services_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT, operator TEXT, service_code TEXT,
      count INTEGER DEFAULT 0, active INTEGER DEFAULT 1
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, activation_id TEXT,
      service TEXT, country TEXT, operator TEXT,
      phone TEXT, status TEXT DEFAULT 'pending',
      cost REAL DEFAULT 0, price REAL DEFAULT 0, profit REAL DEFAULT 0,
      sms_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, type TEXT,
      amount REAL, balance_after REAL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Default settings
    const defaults = {
      profit_percentage: '30',
      min_order_amount: '0.10',
      site_name: 'SmsBower OTP',
      site_description: 'Virtual Numbers for SMS Verification',
      maintenance_mode: '0'
    };
    for (const [k, v] of Object.entries(defaults)) {
      if (!queryOne('SELECT key FROM settings WHERE key = ?', [k])) {
        execute('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
      }
    }

    // Create default admin if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    if (!queryOne('SELECT id FROM users WHERE role = ?', ['admin'])) {
      const hash = bcrypt.hashSync(adminPass, 10);
      execute('INSERT INTO users (email, password, role, balance) VALUES (?,?,?,?)',
        [adminEmail, hash, 'admin', 99999]);
      console.log(`[DB] Admin created: ${adminEmail} / ${adminPass}`);
    }

    saveToDisk();
    ready = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
    console.log('[DB] Ready');
  } catch (err) {
    console.error('[DB] Init failed:', err);
    process.exit(1);
  }
})();

// ── Persistence ──
function saveToDisk() {
  if (!db) return;
  try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); } catch (e) { console.error('[DB] Save error:', e.message); }
}
setInterval(() => { if (ready) saveToDisk(); }, 5000);
process.on('exit', saveToDisk);
process.on('SIGINT', () => { saveToDisk(); process.exit(0); });
process.on('SIGTERM', () => { saveToDisk(); process.exit(0); });

function waitForReady() {
  return new Promise(resolve => { if (ready) return resolve(); readyCallbacks.push(resolve); });
}

// ── Query helpers ──
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
function execute(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastId = queryOne('SELECT last_insert_rowid() as id');
  return { changes, lastId: lastId ? lastId.id : null };
}

// ══════════════════════════════════════════════════
module.exports = {
  waitForReady,

  // ── Users ──
  users: {
    create(email, password, role = 'user') {
      const hash = bcrypt.hashSync(password, 10);
      const r = execute('INSERT INTO users (email, password, role) VALUES (?,?,?)', [email, hash, role]);
      saveToDisk();
      return r;
    },
    findByEmail(email) { return queryOne('SELECT * FROM users WHERE email = ?', [email]); },
    findById(id) { return queryOne('SELECT id, email, role, balance, status, created_at FROM users WHERE id = ?', [id]); },
    getAll() { return queryAll('SELECT id, email, role, balance, status, created_at FROM users ORDER BY created_at DESC'); },
    updateBalance(id, amount) {
      execute("UPDATE users SET balance = balance + ?, created_at = created_at WHERE id = ?", [amount, id]);
      saveToDisk();
      return queryOne('SELECT balance FROM users WHERE id = ?', [id]);
    },
    setBalance(id, balance) {
      execute("UPDATE users SET balance = ? WHERE id = ?", [balance, id]);
      saveToDisk();
    },
    setStatus(id, status) {
      execute("UPDATE users SET status = ? WHERE id = ?", [status, id]);
      saveToDisk();
    },
    setRole(id, role) {
      execute("UPDATE users SET role = ? WHERE id = ?", [role, id]);
      saveToDisk();
    },
    verifyPassword(plain, hash) { return bcrypt.compareSync(plain, hash); },
    count() { return (queryOne('SELECT COUNT(*) as c FROM users') || {}).c || 0; },
  },

  // ── Settings ──
  settings: {
    get(key) { const r = queryOne('SELECT value FROM settings WHERE key = ?', [key]); return r ? r.value : null; },
    set(key, value) {
      const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
      if (existing) execute('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
      else execute('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
      saveToDisk();
    },
    getAll() { return queryAll('SELECT * FROM settings'); },
  },

  // ── Transactions ──
  transactions: {
    create(userId, type, amount, description) {
      const user = queryOne('SELECT balance FROM users WHERE id = ?', [userId]);
      const balanceAfter = (user ? user.balance : 0) + amount;
      execute('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?,?,?,?,?)',
        [userId, type, amount, balanceAfter, description]);
      saveToDisk();
    },
    getByUser(userId, limit = 50, offset = 0) {
      return queryAll('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);
    },
    getAll(limit = 100, offset = 0) {
      return queryAll('SELECT t.*, u.email FROM transactions t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    },
  },

  // ── Orders ──
  orders: {
    create(order) {
      const r = execute(
        'INSERT INTO orders (user_id, activation_id, service, country, operator, phone, status, cost, price, profit) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [order.user_id, order.activation_id, order.service, order.country, order.operator, order.phone, order.status || 'pending', order.cost, order.price, order.profit]
      );
      saveToDisk();
      return r;
    },
    updateStatus(id, status, smsText) {
      execute("UPDATE orders SET status = ?, sms_text = ?, updated_at = datetime('now') WHERE id = ? OR activation_id = ?",
        [status, smsText || null, id, id]);
      saveToDisk();
    },
    getByUser(userId, limit = 50, offset = 0) {
      return queryAll('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);
    },
    getAll(limit = 100, offset = 0) {
      return queryAll('SELECT o.*, u.email FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    },
    countByStatus() {
      return queryAll('SELECT status, COUNT(*) as count FROM orders GROUP BY status');
    },
    totalRevenue() {
      return (queryOne('SELECT SUM(profit) as total FROM orders WHERE status = ?', ['completed']) || {}).total || 0;
    },
  },

  // ── SIM Cards ──
  simCards: {
    upsert(sim) {
      const existing = queryOne('SELECT id FROM sim_cards WHERE phone = ?', [sim.phone]);
      if (existing) execute("UPDATE sim_cards SET iccid=?, imsi=?, mac=?, status=?, active=?, updated_at=datetime('now') WHERE phone=?",
        [sim.iccid, sim.imsi, sim.mac, sim.status, sim.active, sim.phone]);
      else execute('INSERT INTO sim_cards (phone, iccid, imsi, mac, status, active) VALUES (?,?,?,?,?,?)',
        [sim.phone, sim.iccid, sim.imsi, sim.mac, sim.status, sim.active]);
      saveToDisk();
    },
    getAll() { return queryAll('SELECT * FROM sim_cards ORDER BY updated_at DESC'); },
    getAvailable() { return queryOne('SELECT * FROM sim_cards WHERE active = 1 LIMIT 1'); },
    count() { return (queryOne('SELECT COUNT(*) as c FROM sim_cards') || {}).c || 0; },
    activeCount() { return (queryOne('SELECT COUNT(*) as c FROM sim_cards WHERE active = 1') || {}).c || 0; },
  },

  // ── Activations ──
  activations: {
    create(act) { const r = execute('INSERT INTO activations (activation_id, phone, service, country, operator, status, sum, call, voice) VALUES (?,?,?,?,?,?,?,?,?)',
      [act.activation_id, act.phone, act.service, act.country, act.operator, act.status, act.sum, act.call, act.voice]); saveToDisk(); return r; },
    updateStatus(activationId, status) { execute("UPDATE activations SET status=?, updated_at=datetime('now') WHERE activation_id=?", [status, activationId]); saveToDisk(); },
    getByPhone(phone) { return queryOne('SELECT * FROM activations WHERE phone = ? ORDER BY created_at DESC LIMIT 1', [phone]); },
    getAll(status, limit = 20, offset = 0) {
      if (status !== undefined && status !== '' && status !== null)
        return queryAll('SELECT * FROM activations WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [parseInt(status), limit, offset]);
      return queryAll('SELECT * FROM activations ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    },
    getById(id) { return queryOne('SELECT * FROM activations WHERE id = ? OR activation_id = ?', [id, id]); },
  },

  // ── SMS ──
  smsMessages: {
    insert(sms) {
      const r = execute('INSERT INTO sms_messages (activation_id, sender, recipient, text, raw_text, timestamp, pushed, push_status) VALUES (?,?,?,?,?,?,?,?)',
        [sms.activation_id, sms.sender, sms.recipient, sms.text, sms.raw_text, sms.timestamp, sms.pushed, sms.push_status]);
      saveToDisk();
      return { lastInsertRowid: r.lastId };
    },
    getAll(limit = 50, offset = 0) { return queryAll('SELECT * FROM sms_messages ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]); },
    getByActivationId(aid) { return queryAll('SELECT * FROM sms_messages WHERE activation_id = ? ORDER BY created_at DESC', [aid]); },
    count() { return (queryOne('SELECT COUNT(*) as c FROM sms_messages') || {}).c || 0; },
    todayCount() { return (queryOne("SELECT COUNT(*) as c FROM sms_messages WHERE date(created_at) = date('now')") || {}).c || 0; },
  },

  // ── Services Config ──
  servicesConfig: {
    getAll() { return queryAll('SELECT * FROM services_config WHERE active = 1'); },
    getAllIncludingInactive() { return queryAll('SELECT * FROM services_config'); },
    upsert(config) {
      const existing = queryOne('SELECT id FROM services_config WHERE country=? AND operator=? AND service_code=?', [config.country, config.operator, config.service_code]);
      if (existing) execute('UPDATE services_config SET count=?, active=? WHERE id=?', [config.count, config.active !== undefined ? config.active : 1, existing.id]);
      else execute('INSERT INTO services_config (country, operator, service_code, count, active) VALUES (?,?,?,?,?)',
        [config.country, config.operator, config.service_code, config.count, config.active !== undefined ? config.active : 1]);
      saveToDisk();
    },
    delete(id) { execute('DELETE FROM services_config WHERE id = ?', [id]); saveToDisk(); },
  },

  // ── Dashboard Stats ──
  stats: {
    admin() {
      return {
        totalUsers: (queryOne('SELECT COUNT(*) as c FROM users WHERE role = ?', ['user']) || {}).c || 0,
        totalSims: (queryOne('SELECT COUNT(*) as c FROM sim_cards') || {}).c || 0,
        activeSims: (queryOne('SELECT COUNT(*) as c FROM sim_cards WHERE active = 1') || {}).c || 0,
        totalOrders: (queryOne('SELECT COUNT(*) as c FROM orders') || {}).c || 0,
        pendingOrders: (queryOne('SELECT COUNT(*) as c FROM orders WHERE status = ?', ['pending']) || {}).c || 0,
        completedOrders: (queryOne('SELECT COUNT(*) as c FROM orders WHERE status = ?', ['completed']) || {}).c || 0,
        todaySms: (queryOne("SELECT COUNT(*) as c FROM sms_messages WHERE date(created_at) = date('now')") || {}).c || 0,
        totalRevenue: (queryOne("SELECT COALESCE(SUM(profit),0) as t FROM orders WHERE status = 'completed'") || {}).t || 0,
        totalSales: (queryOne("SELECT COALESCE(SUM(price),0) as t FROM orders WHERE status = 'completed'") || {}).t || 0,
      };
    },
  },
};
