/* ============================================================
   SmsBower OTP — Frontend API Client
   Real API calls only — no mock data
   ============================================================ */
const API = {
  baseUrl: '',

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  },

  async getDashboard() {
    return this.request('/api/dashboard');
  },
  async getServices() {
    return this.request('/api/services');
  },
  async getCountries() {
    return this.request('/api/countries');
  },
  async getActivations(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/api/activations${q ? '?' + q : ''}`);
  },
  async getActivation(id) {
    return this.request(`/api/activations/${id}`);
  },
  async getSms(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/api/sms${q ? '?' + q : ''}`);
  },
  async getStatistics() {
    return this.request('/api/statistics');
  },
  async getActivationStatus(activationId) {
    return this.request(`/api/activation-status/${activationId}`);
  },
  async addService(data) {
    return this.request('/api/services', { method: 'POST', body: JSON.stringify(data) });
  },
  async sendTestSms(data) {
    return this.request('/api/test-sms', { method: 'POST', body: JSON.stringify(data) });
  },
};
