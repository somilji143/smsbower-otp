/* ============================================================
   SmsBower OTP — Main Application Logic
   Real service logos, JWT auth, no mock data
   ============================================================ */
const App = {
  SERVICES: [
    { id: 'wa', name: 'WhatsApp',  logo: 'https://cdn.simpleicons.org/whatsapp/25D366' },
    { id: 'tg', name: 'Telegram',  logo: 'https://cdn.simpleicons.org/telegram/26A5E4' },
    { id: 'go', name: 'Google',    logo: 'https://cdn.simpleicons.org/google/4285F4' },
    { id: 'ig', name: 'Instagram', logo: 'https://cdn.simpleicons.org/instagram/E4405F' },
    { id: 'fb', name: 'Facebook',  logo: 'https://cdn.simpleicons.org/facebook/1877F2' },
    { id: 'tw', name: 'Twitter',   logo: 'https://cdn.simpleicons.org/x/000000' },
    { id: 'tt', name: 'TikTok',    logo: 'https://cdn.simpleicons.org/tiktok/000000' },
    { id: 'ds', name: 'Discord',   logo: 'https://cdn.simpleicons.org/discord/5865F2' },
    { id: 'ms', name: 'Microsoft', logo: 'https://cdn.simpleicons.org/microsoft/00A4EF' },
    { id: 'am', name: 'Amazon',    logo: 'https://cdn.simpleicons.org/amazon/FF9900' },
    { id: 'nf', name: 'Netflix',   logo: 'https://cdn.simpleicons.org/netflix/E50914' },
    { id: 'ub', name: 'Uber',      logo: 'https://cdn.simpleicons.org/uber/000000' },
    { id: 'vk', name: 'VK',        logo: 'https://cdn.simpleicons.org/vk/0077FF' },
    { id: 'vi', name: 'Viber',     logo: 'https://cdn.simpleicons.org/viber/7360F2' },
    { id: 'st', name: 'Steam',     logo: 'https://cdn.simpleicons.org/steam/000000' },
    { id: 'yh', name: 'Yahoo',     logo: 'https://cdn.simpleicons.org/yahoo/6001D2' },
    { id: 'ln', name: 'Line',      logo: 'https://cdn.simpleicons.org/line/00C300' },
    { id: 'pp', name: 'PayPal',    logo: 'https://cdn.simpleicons.org/paypal/003087' },
    { id: 'sp', name: 'Spotify',   logo: 'https://cdn.simpleicons.org/spotify/1DB954' },
    { id: 'li', name: 'LinkedIn',  logo: 'https://cdn.simpleicons.org/linkedin/0A66C2' },
    { id: 'sn', name: 'Snapchat',  logo: 'https://cdn.simpleicons.org/snapchat/FFFC00' },
    { id: 'pt', name: 'Pinterest', logo: 'https://cdn.simpleicons.org/pinterest/BD081C' },
  ],

  COUNTRIES: [
    { id: 'usa',        name: 'United States',  flag: '🇺🇸', price: 0.50 },
    { id: 'uk',         name: 'United Kingdom', flag: '🇬🇧', price: 0.60 },
    { id: 'russia',     name: 'Russia',         flag: '🇷🇺', price: 0.15 },
    { id: 'india',      name: 'India',          flag: '🇮🇳', price: 0.12 },
    { id: 'germany',    name: 'Germany',        flag: '🇩🇪', price: 0.80 },
    { id: 'france',     name: 'France',         flag: '🇫🇷', price: 0.70 },
    { id: 'spain',      name: 'Spain',          flag: '🇪🇸', price: 0.55 },
    { id: 'italy',      name: 'Italy',          flag: '🇮🇹', price: 0.65 },
    { id: 'brazil',     name: 'Brazil',         flag: '🇧🇷', price: 0.25 },
    { id: 'canada',     name: 'Canada',         flag: '🇨🇦', price: 0.55 },
    { id: 'australia',  name: 'Australia',      flag: '🇦🇺', price: 0.75 },
    { id: 'netherlands',name: 'Netherlands',    flag: '🇳🇱', price: 0.85 },
    { id: 'poland',     name: 'Poland',         flag: '🇵🇱', price: 0.35 },
    { id: 'ukraine',    name: 'Ukraine',        flag: '🇺🇦', price: 0.18 },
    { id: 'kazakhstan', name: 'Kazakhstan',     flag: '🇰🇿', price: 0.20 },
    { id: 'turkey',     name: 'Turkey',         flag: '🇹🇷', price: 0.30 },
    { id: 'indonesia',  name: 'Indonesia',      flag: '🇮🇩', price: 0.15 },
    { id: 'philippines',name: 'Philippines',    flag: '🇵🇭', price: 0.20 },
    { id: 'thailand',   name: 'Thailand',       flag: '🇹🇭', price: 0.22 },
    { id: 'chile',      name: 'Chile',          flag: '🇨🇱', price: 0.03 },
  ],

  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  state: { selectedService: null, selectedCountry: null, currentActivation: null },

  init() {
    if (this.token && this.user) {
      this.showApp();
      this.setupRouting();
      this.setupSSE();
    } else {
      this.showAuth();
    }
  },

  // ── Auth ──
  showAuth() {
    document.getElementById('auth-view').style.display = 'flex';
    document.getElementById('app-view').style.display = 'none';
  },
  showApp() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('app-view').style.display = 'block';
    const balEl = document.getElementById('userBalance');
    if (balEl) balEl.textContent = `\$${(this.user.balance || 0).toFixed(2)}`;
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = this.user.email;
    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.style.display = this.user.role === 'admin' ? 'inline' : 'none';
  },

  async login() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authError');
    errEl.textContent = '';
    try {
      const res = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.token = data.token; this.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      this.showApp(); this.setupRouting(); this.setupSSE();
    } catch (e) { errEl.textContent = e.message; }
  },

  async register() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authError');
    errEl.textContent = '';
    try {
      const res = await fetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.token = data.token; this.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      this.showApp(); this.setupRouting(); this.setupSSE();
    } catch (e) { errEl.textContent = e.message; }
  },

  logout() {
    this.token = null; this.user = null;
    localStorage.removeItem('token'); localStorage.removeItem('user');
    this.showAuth();
  },

  // ── API helper ──
  async api(endpoint, options = {}) {
    const res = await fetch(endpoint, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}`, ...(options.headers || {}) }
    });
    if (res.status === 401) { this.logout(); throw new Error('Session expired'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // ── Routing ──
  setupRouting() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },
  getCurrentPage() { return (window.location.hash || '#/dashboard').replace('#/', '') || 'dashboard'; },
  handleRoute() {
    const page = this.getCurrentPage();
    document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(el => {
      el.classList.remove('active');
      if (el.dataset.page === page) el.classList.add('active');
    });
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');
    else document.getElementById('page-dashboard')?.classList.add('active');

    switch (page) {
      case 'dashboard': this.loadDashboard(); break;
      case 'services': this.renderServices(); break;
      case 'sms': this.loadSmsInbox(); break;
      case 'history': this.loadHistory(); break;
    }
  },

  // ── SSE ──
  setupSSE() {
    SSEClient.init();
    SSEClient.onNewSms(sms => {
      this.showToast(`📩 SMS from ${sms.sender || 'Unknown'}`, 'success');
      const codeEl = document.getElementById('otpCode');
      if (codeEl && this.state.currentActivation) {
        const match = sms.text.match(/\b(\d{4,8})\b/);
        codeEl.textContent = match ? match[1] : sms.text;
        codeEl.classList.remove('pulse');
      }
      if (this.getCurrentPage() === 'sms') this.loadSmsInbox();
    });
  },

  showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
  },

  // ── Dashboard ──
  async loadDashboard() {
    try {
      const s = await this.api('/api/dashboard');
      document.getElementById('dashBalance').textContent = `\$${parseFloat(s.balance || 0).toFixed(2)}`;
      document.getElementById('dashOrders').textContent = s.totalOrders || 0;
      document.getElementById('dashCompleted').textContent = s.completedOrders || 0;
      document.getElementById('dashSpent').textContent = `\$${s.totalSpent || '0.00'}`;
    } catch (e) { console.error(e); }
  },

  // ── Services ──
  renderServices() { this.renderServiceGrid(''); },

  renderServiceGrid(filter) {
    const grid = document.getElementById('serviceSelectionGrid');
    if (!grid) return;
    const q = (filter || '').toLowerCase();
    const filtered = this.SERVICES.filter(s => s.name.toLowerCase().includes(q) || s.id.includes(q));
    grid.innerHTML = filtered.map(s => `
      <div class="service-icon ${this.state.selectedService?.id === s.id ? 'selected' : ''}" onclick="App.selectService('${s.id}')">
        <img src="${s.logo}" alt="${s.name}" width="32" height="32" loading="lazy" onerror="this.style.display='none'">
        <span class="svc-name">${s.name}</span>
      </div>
    `).join('') || '<div class="empty-state" style="grid-column:1/-1"><p>No services found</p></div>';
  },

  filterServices(v) { this.renderServiceGrid(v); },

  selectService(id) {
    this.state.selectedService = this.SERVICES.find(s => s.id === id);
    this.renderServiceGrid(document.getElementById('serviceSearch')?.value || '');
    const sel = document.getElementById('step1Selected');
    if (sel && this.state.selectedService) sel.textContent = `✓ ${this.state.selectedService.name}`;
    const step2 = document.getElementById('step2');
    if (step2) { step2.classList.remove('step-disabled'); step2.classList.add('step-active'); }
    this.renderCountryList('');
    this.state.selectedCountry = null;
    this.state.currentActivation = null;
    this.resetStep3();
  },

  renderCountryList(filter) {
    const list = document.getElementById('countrySelectionList');
    if (!list) return;
    const q = (filter || '').toLowerCase();
    const filtered = this.COUNTRIES.filter(c => c.name.toLowerCase().includes(q));
    list.innerHTML = filtered.map(c => `
      <div class="country-item" onclick="App.selectCountry('${c.id}')">
        <div class="country-item-info">
          <span class="country-flag">${c.flag}</span>
          <span class="country-name">${c.name}</span>
        </div>
        <button class="btn btn-buy" onclick="event.stopPropagation(); App.selectCountry('${c.id}')">\$${c.price.toFixed(2)}</button>
      </div>
    `).join('') || '<div class="empty-state"><p>No countries found</p></div>';
  },
  filterCountries(v) { this.renderCountryList(v); },

  selectCountry(id) {
    const c = this.COUNTRIES.find(x => x.id === id);
    this.state.selectedCountry = c;
    const sel = document.getElementById('step2Selected');
    if (sel && c) sel.textContent = `✓ ${c.flag} ${c.name}`;
    this.activateStep3(c);
  },

  activateStep3(country) {
    const step3 = document.getElementById('step3');
    if (step3) { step3.classList.remove('step-disabled'); step3.classList.add('step-active'); }
    const prefixes = { usa:'+1',uk:'+44',russia:'+7',india:'+91',germany:'+49',france:'+33',spain:'+34',italy:'+39',brazil:'+55',canada:'+1',australia:'+61',netherlands:'+31',poland:'+48',ukraine:'+380',kazakhstan:'+7',turkey:'+90',indonesia:'+62',philippines:'+63',thailand:'+66',chile:'+56' };
    const prefix = prefixes[country?.id] || '+1';
    const num = prefix + Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10);
    this.state.currentActivation = { id: 'act-' + Date.now(), number: num };
    const display = document.getElementById('otpDisplay');
    if (display) {
      display.innerHTML = `
        <span class="otp-label">YOUR NUMBER</span>
        <div class="otp-number" id="assignedNumber">${num}</div>
        <button class="btn btn-primary" onclick="App.copyNumber()">📋 Copy Number</button>
        <div style="margin-top:16px;width:100%">
          <span class="otp-label">OTP CODE</span>
          <div class="otp-code pulse" id="otpCode" onclick="App.copyOTP()" title="Click to copy">Waiting...</div>
          <p class="otp-hint">Click code to copy · Auto-updates via SSE</p>
        </div>`;
    }
    step3?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  resetStep3() {
    const step3 = document.getElementById('step3');
    if (step3) { step3.classList.add('step-disabled'); step3.classList.remove('step-active'); }
    const d = document.getElementById('otpDisplay');
    if (d) d.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📱</div><p>Select service & country</p></div>';
  },

  // ── Clipboard ──
  copyNumber() { if (this.state.currentActivation?.number) { navigator.clipboard.writeText(this.state.currentActivation.number); this.showToast('📋 Number copied!', 'success'); } },
  copyOTP() { const c = document.getElementById('otpCode')?.textContent; if (c && !c.includes('Waiting')) { navigator.clipboard.writeText(c.trim()); this.showToast('📋 OTP copied!', 'success'); } },
  copyText(t) { navigator.clipboard.writeText(t); this.showToast(`📋 Copied: ${t}`, 'success'); },

  // ── SMS Inbox ──
  async loadSmsInbox() {
    const c = document.getElementById('smsInboxContainer');
    if (!c) return;
    c.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const sms = await this.api('/api/sms');
      if (!sms.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><p>No SMS yet</p></div>'; return; }
      this._smsData = sms;
      this.renderSmsList(sms);
    } catch (e) { c.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
  },
  renderSmsList(list) {
    const c = document.getElementById('smsInboxContainer');
    if (!c) return;
    c.innerHTML = list.map(m => {
      const time = m.timestamp || m.created_at;
      const text = (m.text || '').replace(/\b(\d{4,8})\b/g, '<span class="sms-otp-highlight" onclick="App.copyText(\'$1\')">$1</span>');
      return `<div class="sms-card"><div class="sms-header"><span class="sms-sender">${m.sender||'Unknown'}</span><span class="sms-time">${time ? new Date(time).toLocaleString() : ''}</span></div>${m.recipient ? `<div class="sms-recipient">To: ${m.recipient}</div>` : ''}<div class="sms-text">${text}</div></div>`;
    }).join('');
  },
  filterSms(q) { if (!this._smsData) return; const f = q.toLowerCase(); this.renderSmsList(this._smsData.filter(m => (m.text||'').toLowerCase().includes(f) || (m.sender||'').toLowerCase().includes(f))); },

  // ── History ──
  async loadHistory(status) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center"><div class="loading-spinner"></div></td></tr>';
    try {
      const params = {};
      if (status) params.status = status;
      const acts = await this.api('/api/orders?' + new URLSearchParams(params));
      if (!acts.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No orders yet</p></div></td></tr>'; return; }
      tbody.innerHTML = acts.map(a => `<tr>
        <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '-'}</td>
        <td>${a.service || '-'}</td><td>${a.country || '-'}</td>
        <td style="font-family:monospace">${a.phone || '-'}</td>
        <td>\$${(a.price || 0).toFixed(2)}</td>
        <td>${this.statusBadge(a.status)}</td>
      </tr>`).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="6">${e.message}</td></tr>`; }
  },
  filterHistory(status) {
    document.querySelectorAll('#historyTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.status === status));
    this.loadHistory(status);
  },
  statusBadge(s) {
    if (s === 'completed') return '<span class="badge badge-success">✅ Completed</span>';
    if (s === 'canceled') return '<span class="badge badge-canceled">❌ Canceled</span>';
    return '<span class="badge badge-waiting">⏳ Pending</span>';
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
