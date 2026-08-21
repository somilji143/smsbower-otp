/* ============================================================
   SMSMaster — Main App Logic
   Public browsing, auth-gated purchasing, auto-refund, real logos
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
    { id: 'usa', name: 'United States', flag: '🇺🇸', price: 0.50 },
    { id: 'uk', name: 'United Kingdom', flag: '🇬🇧', price: 0.60 },
    { id: 'russia', name: 'Russia', flag: '🇷🇺', price: 0.15 },
    { id: 'india', name: 'India', flag: '🇮🇳', price: 0.12 },
    { id: 'germany', name: 'Germany', flag: '🇩🇪', price: 0.80 },
    { id: 'france', name: 'France', flag: '🇫🇷', price: 0.70 },
    { id: 'spain', name: 'Spain', flag: '🇪🇸', price: 0.55 },
    { id: 'italy', name: 'Italy', flag: '🇮🇹', price: 0.65 },
    { id: 'brazil', name: 'Brazil', flag: '🇧🇷', price: 0.25 },
    { id: 'canada', name: 'Canada', flag: '🇨🇦', price: 0.55 },
    { id: 'australia', name: 'Australia', flag: '🇦🇺', price: 0.75 },
    { id: 'netherlands', name: 'Netherlands', flag: '🇳🇱', price: 0.85 },
    { id: 'poland', name: 'Poland', flag: '🇵🇱', price: 0.35 },
    { id: 'ukraine', name: 'Ukraine', flag: '🇺🇦', price: 0.18 },
    { id: 'kazakhstan', name: 'Kazakhstan', flag: '🇰🇿', price: 0.20 },
    { id: 'turkey', name: 'Turkey', flag: '🇹🇷', price: 0.30 },
    { id: 'indonesia', name: 'Indonesia', flag: '🇮🇩', price: 0.15 },
    { id: 'philippines', name: 'Philippines', flag: '🇵🇭', price: 0.20 },
    { id: 'thailand', name: 'Thailand', flag: '🇹🇭', price: 0.22 },
    { id: 'chile', name: 'Chile', flag: '🇨🇱', price: 0.03 },
  ],

  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  state: { selectedService: null, selectedCountry: null, refundTimer: null },

  // ── Init ──
  init() {
    this.updateAuthUI();
    this.setupRouting();
    this.setupSSE();
    this.renderServiceGrid('');
  },

  isLoggedIn() { return !!this.token; },

  requireAuth() {
    if (!this.isLoggedIn()) {
      document.getElementById('auth-view').style.display = 'flex';
      return false;
    }
    return true;
  },

  updateAuthUI() {
    const loggedIn = this.isLoggedIn();
    const balEl = document.getElementById('userBalance');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminLink = document.getElementById('adminLink');
    const mobileAuthIcon = document.getElementById('mobileAuthIcon');
    const mobileAuthLabel = document.getElementById('mobileAuthLabel');

    if (balEl) balEl.style.display = loggedIn ? 'inline-block' : 'none';
    if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = loggedIn ? 'inline-flex' : 'none';
    if (adminLink) adminLink.style.display = (loggedIn && this.user?.role === 'admin') ? 'inline-flex' : 'none';
    if (mobileAuthIcon) mobileAuthIcon.textContent = loggedIn ? '🚪' : '🔐';
    if (mobileAuthLabel) mobileAuthLabel.textContent = loggedIn ? 'Logout' : 'Login';

    if (loggedIn && balEl) balEl.textContent = `$${(this.user?.balance || 0).toFixed(2)}`;
  },

  // ── Auth ──
  async login() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authError');
    errEl.textContent = '';
    try {
      const res = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.setAuth(data);
      document.getElementById('auth-view').style.display = 'none';
      this.handleRoute();
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
      this.setAuth(data);
      document.getElementById('auth-view').style.display = 'none';
      this.showToast('🎉 Account created!', 'success');
      this.handleRoute();
    } catch (e) { errEl.textContent = e.message; }
  },
  setAuth(data) {
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    this.updateAuthUI();
  },
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.updateAuthUI();
    window.location.hash = '#/services';
    this.handleRoute();
  },

  async api(endpoint, options = {}) {
    const res = await fetch(endpoint, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}`, ...(options.headers || {}) } });
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
  getCurrentPage() { return (window.location.hash || '#/services').replace('#/', '') || 'services'; },
  handleRoute() {
    const page = this.getCurrentPage();
    const authRequired = ['dashboard', 'sms', 'history'];
    if (authRequired.includes(page) && !this.isLoggedIn()) {
      document.getElementById('auth-view').style.display = 'flex';
      return;
    }
    document.querySelectorAll('.nav-link,.mobile-nav-item').forEach(el => { el.classList.remove('active'); if (el.dataset.page === page) el.classList.add('active'); });
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    (document.getElementById(`page-${page}`) || document.getElementById('page-services')).classList.add('active');
    switch (page) {
      case 'dashboard': this.loadDashboard(); break;
      case 'services': this.renderServiceGrid(''); break;
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
      if (codeEl && codeEl.textContent.includes('Waiting')) {
        const match = (sms.text || '').match(/\b(\d{4,8})\b/);
        codeEl.textContent = match ? match[1] : sms.text;
        codeEl.classList.remove('pulse');
        this.showToast('✅ OTP received!', 'success');
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
      document.getElementById('dashBalance').textContent = `$${parseFloat(s.balance || 0).toFixed(2)}`;
      document.getElementById('dashOrders').textContent = s.totalOrders || 0;
      document.getElementById('dashCompleted').textContent = s.completedOrders || 0;
      document.getElementById('dashSpent').textContent = `$${s.totalSpent || '0.00'}`;
      // Recent orders
      const orders = await this.api('/api/orders?limit=5');
      const el = document.getElementById('dashRecentOrders');
      if (el && orders.length) {
        el.innerHTML = orders.map(o => `<div class="sms-card"><div class="sms-header"><span class="sms-sender">${this.getServiceName(o.service)} · ${o.country || '-'}</span>${this.statusBadge(o.status)}</div><div class="sms-text" style="font-family:monospace;font-size:0.8125rem">${o.phone || '-'} · $${(o.price||0).toFixed(2)}</div></div>`).join('');
      }
    } catch (e) { console.error(e); }
  },

  // ── Services ──
  renderServiceGrid(filter) {
    const grid = document.getElementById('serviceSelectionGrid');
    if (!grid) return;
    const q = (filter || '').toLowerCase();
    const filtered = this.SERVICES.filter(s => s.name.toLowerCase().includes(q) || s.id.includes(q));
    grid.innerHTML = filtered.map(s => `
      <div class="service-icon ${this.state.selectedService?.id === s.id ? 'selected' : ''}" onclick="App.selectService('${s.id}')">
        <img src="${s.logo}" alt="${s.name}" width="32" height="32" loading="lazy" onerror="this.outerHTML='<span class=svc-emoji>📱</span>'">
        <span class="svc-name">${s.name}</span>
      </div>
    `).join('') || '<div class="empty-state" style="grid-column:1/-1"><p>No services found</p></div>';
  },
  filterServices(v) { this.renderServiceGrid(v); },

  selectService(id) {
    this.state.selectedService = this.SERVICES.find(s => s.id === id);
    this.renderServiceGrid(document.getElementById('serviceSearch')?.value || '');
    const sel = document.getElementById('step1Selected');
    if (sel) sel.textContent = this.state.selectedService ? `✓ ${this.state.selectedService.name}` : '';
    const step2 = document.getElementById('step2');
    if (step2) { step2.classList.remove('step-disabled'); step2.classList.add('step-active'); }
    this.renderCountryList('');
    this.state.selectedCountry = null;
    this.resetStep3();
  },

  renderCountryList(filter) {
    const list = document.getElementById('countrySelectionList');
    if (!list) return;
    const q = (filter || '').toLowerCase();
    const filtered = this.COUNTRIES.filter(c => c.name.toLowerCase().includes(q));
    list.innerHTML = filtered.map(c => `
      <div class="country-item" onclick="App.buyNumber('${c.id}')">
        <div class="country-item-info"><span class="country-flag">${c.flag}</span><span class="country-name">${c.name}</span></div>
        <button class="btn btn-buy" onclick="event.stopPropagation();App.buyNumber('${c.id}')">$${c.price.toFixed(2)}</button>
      </div>
    `).join('') || '<div class="empty-state"><p>No countries found</p></div>';
  },
  filterCountries(v) { this.renderCountryList(v); },

  // ── Buy Number ──
  async buyNumber(countryId) {
    if (!this.requireAuth()) return;
    if (!this.state.selectedService) { this.showToast('Select a service first', 'warning'); return; }

    const country = this.COUNTRIES.find(c => c.id === countryId);
    this.state.selectedCountry = country;
    const sel = document.getElementById('step2Selected');
    if (sel && country) sel.textContent = `✓ ${country.flag} ${country.name}`;

    const step3 = document.getElementById('step3');
    if (step3) { step3.classList.remove('step-disabled'); step3.classList.add('step-active'); }

    const display = document.getElementById('otpDisplay');
    if (display) display.innerHTML = '<div class="loading-spinner"></div><p style="text-align:center;margin-top:8px;color:var(--gray-500)">Processing purchase...</p>';

    try {
      const result = await this.api('/api/buy-number', {
        method: 'POST',
        body: JSON.stringify({ service: this.state.selectedService.id, country: countryId, cost: country.price }),
      });

      // Update balance
      this.user.balance = result.balance;
      localStorage.setItem('user', JSON.stringify(this.user));
      this.updateAuthUI();

      // Show number + OTP area
      if (display) {
        display.innerHTML = `
          <span class="otp-label">YOUR NUMBER</span>
          <div class="otp-number" id="assignedNumber">${result.phone || 'Assigned'}</div>
          <button class="btn btn-primary" onclick="App.copyNumber()">📋 Copy Number</button>
          <div style="margin-top:16px;width:100%">
            <span class="otp-label">OTP CODE</span>
            <div class="otp-code pulse" id="otpCode" onclick="App.copyOTP()" title="Click to copy">Waiting...</div>
            <p class="otp-hint">Click code to copy · Auto-updates via SSE</p>
          </div>`;
      }

      // Show activation info with refund timer
      const info = document.getElementById('activationInfo');
      if (info) {
        info.style.display = 'block';
        document.getElementById('actService').textContent = this.state.selectedService.name;
        document.getElementById('actCountry').textContent = country.name;
        const refundMin = Math.floor((result.expiresIn || 600) / 60);
        document.getElementById('actRefund').textContent = `${refundMin} min`;
        this.startRefundCountdown(result.expiresIn || 600);
      }

      this.showToast(`✅ Number purchased for $${result.price}`, 'success');
      step3?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (e) {
      if (display) display.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><p>${e.message}</p></div>`;
      this.showToast(e.message, 'error');
    }
  },

  startRefundCountdown(seconds) {
    if (this.state.refundTimer) clearInterval(this.state.refundTimer);
    let remaining = seconds;
    const el = document.getElementById('actRefund');
    this.state.refundTimer = setInterval(() => {
      remaining--;
      if (el) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        if (remaining <= 60) el.style.color = 'var(--danger)';
      }
      if (remaining <= 0) {
        clearInterval(this.state.refundTimer);
        if (el) el.textContent = 'Refunded';
        this.showToast('💸 Auto-refunded — no SMS received', 'warning');
        // Refresh user balance
        this.api('/api/me').then(u => { this.user = u; localStorage.setItem('user', JSON.stringify(u)); this.updateAuthUI(); }).catch(() => {});
      }
    }, 1000);
  },

  resetStep3() {
    const step3 = document.getElementById('step3');
    if (step3) { step3.classList.add('step-disabled'); step3.classList.remove('step-active'); }
    const d = document.getElementById('otpDisplay');
    if (d) d.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📱</div><p>Select service & country to get started</p></div>';
    const info = document.getElementById('activationInfo');
    if (info) info.style.display = 'none';
    if (this.state.refundTimer) clearInterval(this.state.refundTimer);
  },

  cancelActivation() {
    this.resetStep3();
    this.showToast('Order canceled', 'warning');
  },

  // ── Clipboard ──
  copyNumber() { const n = document.getElementById('assignedNumber')?.textContent; if (n) { navigator.clipboard.writeText(n); this.showToast('📋 Number copied!', 'success'); } },
  copyOTP() { const c = document.getElementById('otpCode')?.textContent; if (c && !c.includes('Waiting')) { navigator.clipboard.writeText(c.trim()); this.showToast('📋 OTP copied!', 'success'); } },
  copyText(t) { navigator.clipboard.writeText(t); this.showToast(`📋 Copied: ${t}`, 'success'); },

  // ── SMS ──
  async loadSmsInbox() {
    const c = document.getElementById('smsInboxContainer');
    if (!c) return;
    c.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const sms = await this.api('/api/sms');
      if (!sms.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><p>No SMS yet</p><p class="text-muted">Messages appear here in real-time</p></div>'; return; }
      this._smsData = sms;
      this.renderSmsList(sms);
    } catch (e) { c.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
  },
  renderSmsList(list) {
    const c = document.getElementById('smsInboxContainer');
    if (!c) return;
    c.innerHTML = list.map(m => {
      const time = m.timestamp || m.created_at;
      const text = (m.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\b(\d{4,8})\b/g, '<span class="sms-otp-highlight" onclick="App.copyText(\'$1\')">$1</span>');
      return `<div class="sms-card"><div class="sms-header"><span class="sms-sender">${(m.sender||'Unknown').replace(/</g,'&lt;')}</span><span class="sms-time">${time ? new Date(time).toLocaleString() : ''}</span></div>${m.recipient ? `<div class="sms-recipient">To: ${m.recipient}</div>` : ''}<div class="sms-text">${text}</div></div>`;
    }).join('');
  },
  filterSms(q) { if (!this._smsData) return; const f = q.toLowerCase(); this.renderSmsList(this._smsData.filter(m => (m.text||'').toLowerCase().includes(f) || (m.sender||'').toLowerCase().includes(f))); },

  // ── History ──
  async loadHistory(status) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center"><div class="loading-spinner"></div></td></tr>';
    try {
      const orders = await this.api('/api/orders');
      const filtered = status ? orders.filter(o => o.status === status) : orders;
      if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No orders</p></div></td></tr>'; return; }
      tbody.innerHTML = filtered.map(a => `<tr>
        <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '-'}</td>
        <td>${this.getServiceName(a.service)}</td><td>${a.country || '-'}</td>
        <td style="font-family:monospace">${a.phone || '-'}</td>
        <td>$${(a.price || 0).toFixed(2)}</td>
        <td>${this.statusBadge(a.status)}</td>
      </tr>`).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="6">${e.message}</td></tr>`; }
  },
  filterHistory(status) {
    document.querySelectorAll('#historyTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.status === status));
    this.loadHistory(status || undefined);
  },

  // ── Helpers ──
  getServiceName(code) { const s = this.SERVICES.find(x => x.id === code); return s ? s.name : (code || '-'); },
  statusBadge(s) {
    if (s === 'completed') return '<span class="badge badge-success">✅ Completed</span>';
    if (s === 'refunded') return '<span class="badge badge-info">💸 Refunded</span>';
    if (s === 'canceled') return '<span class="badge badge-canceled">❌ Canceled</span>';
    return '<span class="badge badge-waiting">⏳ Pending</span>';
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
