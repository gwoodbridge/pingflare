# Pingflare 🔥

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![D1 Database](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

https://github.com/user-attachments/assets/c33e20fd-6a82-4e57-b95a-ec06bbf701f5

Uptime monitoring and heartbeats that runs entirely on the Cloudflare free tier. No servers, no subscriptions. Built with Cloudflare Workers and D1!

Sends alerts through Discord, Slack, Telegram, Email, ntfy, Pushover, generic webhooks, and Apprise.

---

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/butialabs/pingflare)

### 1. Create the D1 database

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Storage & Database > D1 SQL Database**
2. Click **Create database**, name it `pingflare`, and confirm

### 2. Connect the database to the Worker

1. Open **Workers & Pages**, click on the `pingflare` Worker
2. Go to **Settings > Bindings > Add binding**
3. Choose **D1 Database**, set the variable name to `DB`, and select the `pingflare` database

### 3. Set the required secrets

Still on **Settings > Variables**, add the following under **Secret variables**:

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_USER` | Yes | - | Username |
| `ADMIN_PASS` | Yes | - | Password |
| `JWT_SECRET` | Yes | - | Secret used to sign JWT tokens, min 32 characters |
| `DB` | Yes | - | Cloudflare D1 binding, set via dashboard or wrangler.toml |
| `ENCRYPTION_KEY` | Yes | - | Key used to encrypt sensitive notification credentials at rest (bot tokens, passwords, API keys). Min 32 characters. |

### 4. Redeploy

Click **Deployments > Retry deploy** (or push any commit). On the first request, the Worker automatically creates all database tables.

Your dashboard will be live at `https://pingflare.<your-subdomain>.workers.dev`.

---

## Docs

- [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md)
- [LOCALES.md](docs/LOCALES.md)
- [API.md](docs/API.md)

---

## Cloudflare Free Tier Limits

Pingflare is designed to stay within Cloudflare free tier limits:

- Workers: 100,000 requests per day
- D1: 100,000 write rows per day, 5 million read rows per day
- Cron Triggers: minimum 1-minute interval

With the default 90-day log retention and automatic cleanup on each cron run, write usage stays bounded proportional to the number of active monitors.
