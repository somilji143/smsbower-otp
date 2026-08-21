# ⚡ SmsBower OTP Platform

Full-stack OTP/SMS verification platform integrated with the [SmsBower Partner API](https://smsbower.app). Features user authentication, admin panel with profit management, real-time SMS monitoring, and responsive UI.

## Features

- **User Dashboard** — Buy virtual numbers, receive OTP codes, track orders
- **Admin Panel** — User management, profit %, financial overview, SIM monitoring
- **Real Service Logos** — WhatsApp, Telegram, Google, Instagram, and 20+ services
- **Real-time SMS** — Server-Sent Events for instant OTP delivery
- **JWT Authentication** — Secure login/register with role-based access
- **SmsBower API Integration** — Webhook handler, PUSH_SMS, GET_SERVICES, GET_NUMBER
- **Responsive UI** — Mobile-first design, works on all devices

## Quick Start

```bash
git clone https://github.com/somilji143/smsbower-otp.git
cd smsbower-otp
npm install
cp .env.example .env   # Edit with your API keys
npm start
```

Open http://localhost:3000

**Default Admin:** `admin@admin.com` / `admin123`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SMSBOWER_BASE_URL` | SmsBower API base URL |
| `SMSBOWER_API_KEY` | Your SmsBower API key |
| `PARTNER_API_KEY` | Your partner/webhook API key |
| `JWT_SECRET` | Secret key for JWT tokens |
| `ADMIN_EMAIL` | Default admin email |
| `ADMIN_PASSWORD` | Default admin password |
| `PORT` | Server port (default: 3000) |

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Push to GitHub
2. Connect repo in Railway
3. Set environment variables in Railway dashboard
4. Deploy!

## Tech Stack

- **Backend:** Node.js, Express, sql.js (pure JS SQLite)
- **Auth:** JWT + bcryptjs
- **Frontend:** Vanilla HTML/CSS/JS, Server-Sent Events
- **Icons:** Simple Icons CDN (real brand logos)

## API Endpoints

### Auth
- `POST /auth/register` — Register new user
- `POST /auth/login` — Login, returns JWT

### User API (requires JWT)
- `GET /api/dashboard` — User stats
- `GET /api/orders` — User's orders
- `GET /api/sms` — SMS messages
- `GET /api/sms/stream` — SSE real-time stream

### Admin API (requires JWT + admin role)
- `GET /admin/stats` — Platform statistics
- `GET/PATCH /admin/users` — User management
- `GET/POST /admin/settings` — Platform settings
- `GET /admin/orders` — All orders
- `GET /admin/transactions` — All transactions

### Partner API (from SmsBower)
- `POST /partner/api` — GET_SERVICES, GET_NUMBER, FINISH_ACTIVATION

### Webhook (from GSM modem)
- `POST /api/:apiKey/webhook` — dev-status, recv-sms

## License

MIT
