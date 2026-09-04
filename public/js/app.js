/* ============================================================
   SMSMaster — main app
   Real catalog (all services, live prices & stock from provider),
   real purchases, live OTP delivery, rank tiers, auto-refund.
   ============================================================ */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const fmtPrice = v => {
  const n = +v || 0;
  const d = n < 0.01 ? 4 : n < 1 ? 3 : 2;
  let s = n.toFixed(d);
  // trim trailing zeros but always keep 2 decimals ($0.120 → $0.12)
  if (d > 2) s = s.replace(/0+$/, '').padEnd(s.indexOf('.') + 3, '0');
  return s;
};
const icon = (name, size = 14) => `<svg width="${size}" height="${size}"><use href="#i-${name}"/></svg>`;

const App = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  services: [],        // [{code, name, logo}]
  offers: [],          // per-country offers for the selected service
  activations: [],     // live purchased numbers
  state: { service: null, rank: 'all', sort: 'popular', serviceFilter: '', countryFilter: '' },
  _pollTimers: {},

  // ── Init ──
  init() {
    this.updateAuthUI();
    this.setupRouting();
    this.setupSSE();
    this.loadServices();
    if (this.isLoggedIn()) this.restoreActiveOrders();
    setInterval(() => this.tickTimers(), 1000);
  },

  isLoggedIn() { return !!this.token; },
  openAuth() { document.getElementById('auth-view').style.display = 'flex'; },
  closeAuth() { document.getElementById('auth-view').style.display = 'none'; },
  requireAuth() { if (!this.isLoggedIn()) { this.openAuth(); return false; } return true; },

  updateAuthUI() {
    const loggedIn = this.isLoggedIn();
    const show = (id, on, disp = 'inline-flex') => { const el = document.getElementById(id); if (el) el.style.display = on ? disp : 'none'; };
    show('userBalance', loggedIn);
    show('addFundsBtn', loggedIn);
    show('loginBtn', !loggedIn);
    show('logoutBtn', loggedIn);
    show('adminLink', loggedIn && this.user?.role === 'admin');
    const bal = document.querySelector('#userBalance span');
    if (loggedIn && bal) bal.textContent = `$${fmtPrice(this.user?.balance)}`;
  },

  setBalance(balance) {
    if (this.user) { this.user.balance = balance; localStorage.setItem('user', JSON.stringify(this.user)); }
    this.updateAuthUI();
  },

  // ── Auth ──
  async login() { await this._auth('/auth/login'); },
  async register() { await this._auth('/auth/register'); },
  async _auth(endpoint) {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authError');
    errEl.textContent = '';
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      this.updateAuthUI();
      this.closeAuth();
      this.restoreActiveOrders();
      this.handleRoute();
      this.showToast('Welcome!', 'success');
    } catch (e) { errEl.textContent = e.message; }
  },
  logout() {
    this.token = null; this.user = null;
    localStorage.removeItem('token'); localStorage.removeItem('user');
    Object.values(this._pollTimers).forEach(clearInterval);
    this._pollTimers = {}; this.activations = [];
    this.renderActivations();
    this.updateAuthUI();
    window.location.hash = '#/services';
  },

  async api(endpoint, options = {}) {
    const res = await fetch(endpoint, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}`, ...(options.headers || {}) } });
    if (res.status === 401) { this.logout(); this.openAuth(); throw new Error('Session expired — sign in again'); }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned non-JSON response');
    }
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // ── Routing ──
  setupRouting() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },
  getCurrentPage() { return (window.location.hash || '#/services').replace('#/', '') || 'services'; },
  handleRoute() {
    const page = this.getCurrentPage();
    if (['dashboard', 'sms', 'history'].includes(page) && !this.isLoggedIn()) { this.openAuth(); return; }
    document.querySelectorAll('.nav-link,.mob-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    (document.getElementById(`page-${page}`) || document.getElementById('page-services')).classList.add('active');
    if (page === 'dashboard') this.loadDashboard();
    if (page === 'sms') this.loadSmsInbox();
    if (page === 'history') this.loadHistory();
  },

  // ── SSE ──
  setupSSE() {
    SSEClient.init();
    SSEClient.onNewSms(sms => {
      if (this.getCurrentPage() === 'sms') this.loadSmsInbox();
    });
    SSEClient.onActivation(a => {
      const act = this.activations.find(x => x.id === a.orderId);
      if (!act) return;
      act.status = a.status;
      if (a.code) act.last_code = a.code;
      if (a.status === 'completed' && a.code) this.showToast(`Code received: ${a.code}`, 'success');
      if (a.status === 'refunded') { this.showToast('Number refunded to your balance', 'warning'); this.refreshBalance(); }
      this.renderActivations();
    });
  },

  async refreshBalance() {
    try { const u = await this.api('/api/me'); this.setBalance(u.balance); } catch {}
  },

  showToast(msg, type = 'info') {
    const icons = { success: 'check', error: 'x', warning: 'info', info: 'info' };
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `${icon(icons[type] || 'info', 15)}<span></span>`;
    t.querySelector('span').textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
  },

  addFunds() {
    this.showToast('To add funds, contact support / the site admin', 'info');
  },

  /* ══════════ SERVICES (real, all of them) ══════════ */
  async loadServices() {
    const grid = document.getElementById('serviceGrid');
    try {
      this.services = await fetch('/api/catalog/services').then(r => { if (!r.ok) throw new Error('catalog'); return r.json(); });
      document.getElementById('serviceCount').textContent = `${this.services.length} services`;
      const stat = document.getElementById('statServices');
      if (stat && this.services.length) {
        setTimeout(() => {
          stat.textContent = this.services.length < 1000 ? this.services.length : (this.services.length + '+');
        }, 500);
      }
      this.renderServices();
    } catch (e) {
      grid.innerHTML = `<div class="empty-hint">Could not load services from provider.<br>Check SMSBOWER_API_KEY on the server.</div>`;
    }
  },

  avatarColor(code) {
    let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h},55%,45%)`;
  },

  simpleIconSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/messenger$/, '');
  },

  renderServices() {
    const grid = document.getElementById('serviceGrid');
    const q = this.state.serviceFilter.toLowerCase();
    const list = q ? this.services.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) : this.services;
    if (!list.length) { grid.innerHTML = '<div class="empty-hint">No services match your search</div>'; return; }
    grid.innerHTML = list.map(s => {
      const fallbackSlug = this.simpleIconSlug(s.name);
      const fallbackUrl = `https://cdn.simpleicons.org/${fallbackSlug}`;
      const avatarHtml = `<div class=&quot;service-avatar&quot; style=&quot;background:${this.avatarColor(s.code)}&quot;>${esc(s.name.charAt(0).toUpperCase())}</div>`;
      return `
      <div class="service-cell ${this.state.service === s.code ? 'selected' : ''}" onclick="App.selectService('${esc(s.code)}')" title="${esc(s.name)}">
        <img src="${esc(s.logo)}" alt="" loading="lazy"
             onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='${esc(fallbackUrl)}';}else{this.outerHTML='${avatarHtml}';}">
        <span class="svc-name">${esc(s.name)}</span>
      </div>`;
    }).join('');
  },
  filterServices(v) { this.state.serviceFilter = v; this.renderServices(); },

  async selectService(code) {
    this.state.service = code;
    this.renderServices();
    const svc = this.services.find(s => s.code === code);
    document.getElementById('selectedServiceLabel').innerHTML = svc ? `${icon('check', 13)} ${esc(svc.name)} selected` : '';
    const list = document.getElementById('countryList');
    list.innerHTML = '<div class="sk-row"></div>'.repeat(6);
    document.getElementById('countryCount').textContent = '';
    try {
      this.offers = await fetch(`/api/catalog/offers?service=${encodeURIComponent(code)}`).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to load prices');
        return d;
      });
      this.renderCountries();
    } catch (e) {
      list.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`;
    }
  },

  setRank(rank) {
    this.state.rank = rank;
    document.querySelectorAll('#rankTabs .rank-tab').forEach(t => t.classList.toggle('active', t.dataset.rank === rank));
    if (this.state.service) this.renderCountries();
  },

  setSort(sort) {
    this.state.sort = sort;
    document.querySelectorAll('#sortTabs .sort-btn').forEach(t => t.classList.toggle('active', t.dataset.sort === sort));
    this.renderCountries();
  },

  renderCountries() {
    const list = document.getElementById('countryList');
    if (!this.state.service) { list.innerHTML = '<div class="empty-hint">Pick a service first to see live prices &amp; stock</div>'; return; }
    const q = this.state.countryFilter.toLowerCase();
    const rank = this.state.rank;

    let rows = this.offers.map(o => {
      let price = o.price, count = o.count;
      if (rank !== 'all') {
        const tier = o.tiers?.[rank];
        if (!tier || !tier.count) return null;
        price = tier.price; count = tier.count;
      }
      return { ...o, price, count };
    }).filter(Boolean);

    if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q));

    const sortFns = {
      popular: (a, b) => b.count - a.count,
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    rows.sort(sortFns[this.state.sort] || sortFns.popular);

    document.getElementById('countryCount').textContent = `${rows.length} countries`;
    if (!rows.length) { list.innerHTML = '<div class="empty-hint">No stock for this selection — try another rank or service</div>'; return; }

    list.innerHTML = rows.map(r => `
      <div class="country-row">
        ${r.iso
          ? `<img class="country-flag" src="https://flagcdn.com/w40/${esc(r.iso)}.png" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;country-flag-emoji&quot;>🌐</span>'">`
          : '<span class="country-flag-emoji">🌐</span>'}
        <div class="country-info">
          <div class="country-name">${esc(r.name)}</div>
          <div class="country-stock">${Number(r.count).toLocaleString()} available</div>
        </div>
        <button class="btn-buy" onclick="App.buyNumber('${esc(r.country)}', ${r.price})">$${fmtPrice(r.price)}</button>
      </div>`).join('');
  },
  filterCountries(v) { this.state.countryFilter = v; this.renderCountries(); },

  /* ══════════ BUY (real purchase from provider) ══════════ */
  async buyNumber(country, shownPrice) {
    if (!this.requireAuth()) return;
    if (!this.state.service) { this.showToast('Select a service first', 'warning'); return; }
    if ((+this.user?.balance || 0) < shownPrice) { this.showToast(`Insufficient balance — number costs $${fmtPrice(shownPrice)}. Use "Add funds".`, 'error'); return; }

    this.showToast('Requesting a number…');
    try {
      const rank = this.state.rank !== 'all' ? this.state.rank : undefined;
      const result = await this.api('/api/buy-number', { method: 'POST', body: JSON.stringify({ service: this.state.service, country, rank }) });
      this.setBalance(result.balance);
      this.addActivation({
        id: result.orderId, activation_id: result.activationId, phone: result.phone,
        service: result.service, service_name: result.serviceName,
        country: result.country, country_name: result.countryName,
        price: result.price, status: 'pending', last_code: null,
        expires_at: result.expiresAt,
      });
      this.showToast(`Number ready: +${result.phone} ($${fmtPrice(result.price)})`, 'success');
      document.getElementById('activationsPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  async restoreActiveOrders() {
    try {
      const orders = await this.api('/api/active-orders');
      orders.forEach(o => this.addActivation({ ...o, price: +o.price }));
      this.refreshBalance();
    } catch {}
  },

  addActivation(act) {
    if (this.activations.some(a => a.id === act.id)) return;
    this.activations.unshift(act);
    this.renderActivations();
    this.startPolling(act.id);
  },

  startPolling(orderId) {
    if (this._pollTimers[orderId]) return;
    this._pollTimers[orderId] = setInterval(async () => {
      const act = this.activations.find(a => a.id === orderId);
      if (!act || ['refunded', 'finished'].includes(act.status)) return this.stopPolling(orderId);
      try {
        const o = await this.api(`/api/orders/${orderId}/status`);
        const hadCode = !!act.last_code;
        act.status = o.status;
        act.last_code = o.last_code;
        if (o.last_code && !hadCode) this.showToast(`Code received: ${o.last_code}`, 'success');
        if (o.status === 'refunded') { this.showToast('Refunded — no SMS received', 'warning'); this.refreshBalance(); this.stopPolling(orderId); }
        this.renderActivations();
      } catch {}
    }, 4000);
  },
  stopPolling(orderId) { clearInterval(this._pollTimers[orderId]); delete this._pollTimers[orderId]; },

  tickTimers() {
    this.activations.forEach(act => {
      const el = document.getElementById(`timer-${act.id}`);
      if (!el || !act.expires_at) return;
      const left = Math.max(0, Math.floor((new Date(act.expires_at) - Date.now()) / 1000));
      const m = Math.floor(left / 60), s = left % 60;
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
      (el.closest('.act-timer') || el).classList.toggle('danger', left < 120);
      const cancelBtn = document.getElementById(`cancel-${act.id}`);
      if (cancelBtn) {
        const age = (Date.now() - new Date(act.created_at || Date.now() - 1)) / 1000;
        const canCancel = act.created_at ? age > 120 : true;
        cancelBtn.disabled = !canCancel;
        cancelBtn.title = canCancel ? '' : 'Cancellation available 2 minutes after purchase';
      }
    });
  },

  renderActivations() {
    const el = document.getElementById('activationsList');
    const visible = this.activations.filter(a => !['finished'].includes(a.status));
    if (!visible.length) {
      el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon('sim', 26)}</div>
        <h4>No active numbers yet</h4>
        <p>Choose a service on the left — your number and incoming SMS will show up here in real time.</p>
      </div>`;
      return;
    }
    el.innerHTML = visible.map(a => {
      const svc = this.services.find(s => s.code === a.service);
      const logo = svc?.logo || '';
      const isDone = a.status === 'completed';
      const isRefunded = a.status === 'refunded';
      return `
      <div class="act-card ${isDone ? 'completed' : ''}">
        <img class="act-logo" src="${esc(logo)}" alt="" onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='https://cdn.simpleicons.org/${this.simpleIconSlug(a.service_name || a.service || '')}';}else{this.outerHTML='<div class=&quot;service-avatar act-logo&quot; style=&quot;background:${this.avatarColor(a.service || '?')}&quot;>${esc((a.service_name || a.service || '?').charAt(0).toUpperCase())}</div>';}">
        <div class="act-mid">
          <div class="act-phone">+${esc(a.phone)} <button class="copy-btn" onclick="App.copy('+${esc(a.phone)}')">${icon('copy', 11)} COPY</button></div>
          <div class="act-sub">
            ${esc(a.service_name || a.service)} · ${esc(a.country_name || a.country)}
            · $${fmtPrice(a.price)}
            ${!isRefunded ? `· <span class="act-timer">${icon('clock', 12)}<span id="timer-${a.id}">--:--</span></span>` : ''}
          </div>
        </div>
        <div class="act-code-zone">
          ${isRefunded
            ? '<span class="badge badge-info">Refunded</span>'
            : a.last_code
              ? `<div class="act-code" onclick="App.copy('${esc(a.last_code)}')" title="Click to copy">${esc(a.last_code)}</div>`
              : '<div class="act-waiting"><div class="spinner"></div> Waiting for SMS…</div>'}
          ${!isRefunded ? `
          <div class="act-actions">
            ${a.last_code ? `
              <button class="btn btn-outline btn-sm" onclick="App.retryOrder(${a.id})" title="Request another SMS on this number (free)">${icon('refresh', 13)} Another SMS</button>
              <button class="btn btn-primary btn-sm" onclick="App.finishOrder(${a.id})">${icon('check', 13)} Done</button>
            ` : `
              <button class="btn-danger-ghost" id="cancel-${a.id}" onclick="App.cancelOrder(${a.id})">Cancel</button>
            `}
          </div>` : ''}
        </div>
      </div>`;
    }).join('');
    this.tickTimers();
  },

  async cancelOrder(id) {
    try {
      const r = await this.api(`/api/orders/${id}/cancel`, { method: 'POST' });
      const act = this.activations.find(a => a.id === id);
      if (act) act.status = 'refunded';
      this.setBalance(r.balance);
      this.stopPolling(id);
      this.renderActivations();
      this.showToast('Cancelled — money refunded', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  async retryOrder(id) {
    try {
      await this.api(`/api/orders/${id}/retry`, { method: 'POST' });
      const act = this.activations.find(a => a.id === id);
      if (act) { act.status = 'pending'; act.last_code = null; }
      this.startPolling(id);
      this.renderActivations();
      this.showToast('Waiting for the next SMS…');
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  async finishOrder(id) {
    try {
      await this.api(`/api/orders/${id}/finish`, { method: 'POST' });
      this.activations = this.activations.filter(a => a.id !== id);
      this.stopPolling(id);
      this.renderActivations();
      this.showToast('Activation completed', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  copy(text) { navigator.clipboard.writeText(text); this.showToast(`Copied: ${text}`, 'success'); },

  /* ══════════ DASHBOARD ══════════ */
  async loadDashboard() {
    try {
      const s = await this.api('/api/dashboard');
      document.getElementById('dashBalance').textContent = `$${fmtPrice(s.balance)}`;
      document.getElementById('dashOrders').textContent = s.totalOrders || 0;
      document.getElementById('dashCompleted').textContent = s.completedOrders || 0;
      document.getElementById('dashSpent').textContent = `$${fmtPrice(s.totalSpent)}`;
      const orders = await this.api('/api/orders?limit=6');
      const el = document.getElementById('dashRecentOrders');
      el.innerHTML = orders.length ? orders.map(o => `
        <div class="sms-card">
          <div class="sms-header"><span class="sms-sender">${esc(o.service_name || o.service)} · ${esc(o.country_name || o.country || '-')}</span>${this.statusBadge(o.status)}</div>
          <div class="sms-text td-mono">+${esc(o.phone)} · $${fmtPrice(o.price)}${o.last_code ? ` · code: <b>${esc(o.last_code)}</b>` : ''}</div>
        </div>`).join('') : '<div class="empty-hint">No orders yet</div>';
    } catch (e) { console.error(e); }
  },

  /* ══════════ SMS INBOX ══════════ */
  async loadSmsInbox() {
    const c = document.getElementById('smsInboxContainer');
    c.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
    try {
      const sms = await this.api('/api/sms');
      this._smsData = sms;
      this.renderSmsList(sms);
    } catch (e) { c.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; }
  },
  renderSmsList(list) {
    const c = document.getElementById('smsInboxContainer');
    if (!list.length) {
      c.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon('inbox', 26)}</div>
        <h4>No SMS yet</h4>
        <p>Messages arrive here in real time as soon as your numbers receive them.</p>
      </div>`;
      return;
    }
    c.innerHTML = list.map(m => {
      const text = esc(m.text).replace(/\b(\d{4,8})\b/g, '<span class="sms-otp-highlight" onclick="App.copy(\'$1\')">$1</span>');
      const time = m.timestamp || m.created_at;
      return `<div class="sms-card"><div class="sms-header"><span class="sms-sender">${esc(m.sender || 'Unknown')}</span><span class="sms-time">${time ? new Date(time).toLocaleString() : ''}</span></div>${m.recipient ? `<div class="sms-recipient">To: ${esc(m.recipient)}</div>` : ''}<div class="sms-text">${text}</div></div>`;
    }).join('');
  },
  filterSms(q) { if (!this._smsData) return; const f = q.toLowerCase(); this.renderSmsList(this._smsData.filter(m => (m.text || '').toLowerCase().includes(f) || (m.sender || '').toLowerCase().includes(f))); },

  /* ══════════ HISTORY ══════════ */
  async loadHistory(status) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center"><div class="spinner" style="margin:12px auto"></div></td></tr>';
    try {
      const orders = await this.api('/api/orders?limit=200');
      const filtered = status ? orders.filter(o => o.status === status) : orders;
      if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty-hint">No orders</div></td></tr>'; return; }
      tbody.innerHTML = filtered.map(o => `<tr>
        <td>${o.created_at ? new Date(o.created_at).toLocaleString() : '-'}</td>
        <td>${esc(o.service_name || o.service)}</td>
        <td>${esc(o.country_name || o.country || '-')}</td>
        <td class="td-mono">+${esc(o.phone || '-')}</td>
        <td>${o.last_code ? `<span class="sms-otp-highlight" onclick="App.copy('${esc(o.last_code)}')">${esc(o.last_code)}</span>` : '—'}</td>
        <td class="td-mono">$${fmtPrice(o.price)}</td>
        <td>${this.statusBadge(o.status)}</td>
      </tr>`).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7">${esc(e.message)}</td></tr>`; }
  },
  filterHistory(status) {
    document.querySelectorAll('#historyTabs .chip').forEach(t => t.classList.toggle('active', t.dataset.status === status));
    this.loadHistory(status || undefined);
  },

  statusBadge(s) {
    if (s === 'completed' || s === 'finished') return '<span class="badge badge-success">Completed</span>';
    if (s === 'refunded') return '<span class="badge badge-info">Refunded</span>';
    if (s === 'canceled') return '<span class="badge badge-canceled">Canceled</span>';
    return '<span class="badge badge-waiting">Pending</span>';
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
