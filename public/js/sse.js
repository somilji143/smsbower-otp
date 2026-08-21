/* ============================================================
   SMSMaster — Server-Sent Events Client
   Real-time SMS updates with auto-reconnect & notifications
   ============================================================ */
const SSEClient = {
  eventSource: null,
  reconnectAttempts: 0,
  maxReconnectDelay: 30000,
  isConnected: false,

  callbacks: {
    onNewSms: [],
    onStatusChange: [],
    onConnect: [],
    onDisconnect: [],
  },

  init() {
    this.requestNotificationPermission();
    this.connect();
  },

  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource('/api/sms/stream');

      this.eventSource.onopen = () => {
        console.log('[SSE] Connected');
        this.reconnectAttempts = 0;
        this.isConnected = true;
        this.updateConnectionUI(true);
        this.callbacks.onConnect.forEach(cb => cb());
      };

      // Default "message" event — backend sends unnamed events via `data: ...`
      this.eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[SSE] New SMS:', data);
          this.callbacks.onNewSms.forEach(cb => cb(data));
          this.showNotification(
            `SMS from ${data.sender || 'Unknown'}`,
            data.text || 'New message received'
          );
        } catch (err) {
          console.warn('[SSE] Parse error:', err);
        }
      };

      // Named events
      this.eventSource.addEventListener('sms', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.callbacks.onNewSms.forEach(cb => cb(data));
          this.showNotification(`SMS from ${data.sender || 'Unknown'}`, data.text || '');
        } catch (err) {
          console.warn('[SSE] Parse error:', err);
        }
      });

      this.eventSource.addEventListener('status', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.callbacks.onStatusChange.forEach(cb => cb(data));
        } catch (err) {
          console.warn('[SSE] Parse error:', err);
        }
      });

      this.eventSource.onerror = () => {
        console.warn('[SSE] Connection lost, reconnecting...');
        this.isConnected = false;
        this.updateConnectionUI(false);
        this.callbacks.onDisconnect.forEach(cb => cb());
        this.eventSource.close();
        this.scheduleReconnect();
      };

    } catch (err) {
      console.warn('[SSE] Failed to connect:', err);
      this.isConnected = false;
      this.updateConnectionUI(false);
      this.scheduleReconnect();
    }
  },

  scheduleReconnect() {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;
    console.log(`[SSE] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  },

  // ── Callback registration ──
  onNewSms(callback) { this.callbacks.onNewSms.push(callback); },
  onStatusChange(callback) { this.callbacks.onStatusChange.push(callback); },
  onConnect(callback) { this.callbacks.onConnect.push(callback); },
  onDisconnect(callback) { this.callbacks.onDisconnect.push(callback); },

  // ── UI helpers ──
  updateConnectionUI(connected) {
    const dot = document.getElementById('connectionDot');
    const label = document.getElementById('connectionLabel');
    if (dot) {
      dot.classList.toggle('connected', connected);
    }
    if (label) {
      label.textContent = connected ? 'Live' : 'Offline';
      label.style.color = connected ? 'var(--success)' : 'var(--gray-400)';
    }
  },

  // ── Desktop notifications ──
  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        console.log('[SSE] Notification permission:', p);
      });
    }
  },

  showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
          badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
          silent: false,
        });
      } catch (e) {
        // Notification API may not be available in some contexts
      }
    }
  },

  destroy() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
};
