# ⚡ SmsBower OTP Reseller Platform

Full-stack OTP/SMS reselling platform on top of the [SmsBower activation API](https://smsbower.app/api). All services, countries, prices and stock are pulled live from SmsBower; your profit margin is added on top automatically.

## Features

- **Real catalog** — every service and country SmsBower offers, with live prices & stock
- **Position ranks** — Gold / Silver / Bronze provider tiers per country
- **Real purchases** — numbers bought via `getNumberV2`, OTP codes polled via `getStatus`
- **Auto-refund** — expired activations are cancelled upstream and refunded to the user
- **Profit margin** — admin sets `profit_percentage`; every displayed price = provider cost + margin
- **Admin Panel** — users, balances, profit %, orders, transactions, SmsBower balance
- **Real-time updates** — Server-Sent Events push codes/refunds instantly
- **JWT Authentication** — login/register with role-based access

## Admin panel access

Open **`/admin.html`** (e.g. http://localhost:3000/admin.html) and log in with the admin
account defined by `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars.
Default: `admin@admin.com` / `admin123` — **change this in production!**

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
| `DATABASE_URL` | PostgreSQL connection string |
| `SMSBOWER_BASE_URL` | SmsBower base URL (default `https://smsbower.online`) |
| `SMSBOWER_API_KEY` | Your SmsBower **user API key** (profile → API) — required for reselling |
| `PARTNER_API_KEY` | Only for GSM-modem suppliers (partner protocol), optional |
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

### Public catalog (live from SmsBower)
- `GET /api/catalog/services` — all services with logos
- `GET /api/catalog/countries` — all countries with ISO codes for flags
- `GET /api/catalog/offers?service=tg` — per-country price/stock + Gold/Silver/Bronze tiers

### User API (requires JWT)
- `GET /api/dashboard` — User stats
- `GET /api/orders` — User's orders
- `POST /api/buy-number` — Buy a real number `{service, country, rank?}`
- `GET /api/orders/:id/status` — Poll activation (proxies SmsBower getStatus)
- `POST /api/orders/:id/cancel` — Cancel + refund (allowed 2 min after purchase)
- `POST /api/orders/:id/retry` — Request another SMS (free)
- `POST /api/orders/:id/finish` — Complete activation
- `GET /api/sms` — SMS messages
- `GET /api/sms/stream` — SSE real-time stream (`sms` + `activation` events)

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
