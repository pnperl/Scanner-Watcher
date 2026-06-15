# Chartink Scanner Monitor

A production-ready stock screener monitoring dashboard. Polls [Chartink](https://chartink.com) scanners on a schedule, sends Telegram alerts for new signals, and displays everything on a Bloomberg-style live dashboard.

![Dashboard](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20PostgreSQL-teal)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Live dashboard** — stats, hourly heatmap, co-occurrence matrix, recent signals
- **Scanner management** — add/edit/disable Chartink screeners, manual trigger, scan latency tracking
- **Telegram alerts** — deduped per symbol per scanner per day (IST), fires only on new signals
- **Alert log** — 30-day calendar view, scanner filter, CSV export
- **15-day breakout strategy** — auto-runs after each scan, BUY/HOLD/EXIT signals with confidence scores
- **Themes** — Bloomberg (default), Emerald, Amber, Cobalt, Light

---

## One-Click Setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm` |
| PostgreSQL | any | [Neon](https://neon.tech) (free, no card) |

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/chartink-monitor.git
cd chartink-monitor

# 2. Run setup (installs deps, configures .env, pushes DB schema)
chmod +x setup.sh
./setup.sh
```

The setup script will:
- Ask for your `DATABASE_URL` (paste from Neon/Supabase)
- Ask for your Telegram bot token and chat ID (optional — skip to disable alerts)
- Install all dependencies via pnpm
- Push the full database schema automatically

### Start the app

Open two terminals:

```bash
# Terminal 1 — API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Dashboard (port 5173)
pnpm --filter @workspace/dashboard run dev
```

Open **http://localhost:5173** in your browser.

---

## Manual Setup (without the script)

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

# Push database schema
pnpm --filter @workspace/db run push

# Start API server
pnpm --filter @workspace/api-server run dev

# Start dashboard (new terminal)
pnpm --filter @workspace/dashboard run dev
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | No | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | No | Group/channel ID for alerts |
| `SESSION_SECRET` | No | Random string (for future auth) |

**Free PostgreSQL options:**
- [Neon](https://neon.tech) — serverless Postgres, generous free tier
- [Supabase](https://supabase.com) — Postgres with extras, free tier

**Get your Telegram Chat ID:**
1. Add your bot to a group or channel
2. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Look for `"chat":{"id": ...}` in the response

---

## Adding Your First Scanner

1. Open the dashboard → **Scanners** page
2. Click **Add Scanner**
3. Paste a Chartink screener URL (e.g. `https://chartink.com/screener/my-screen`)
4. Set interval (minutes between polls)
5. Click **Save** — polling starts immediately

---

## Project Structure

```
artifacts/
  api-server/       Express 5 API (routes, poller, Telegram, strategy engine)
  dashboard/        React + Vite frontend
lib/
  db/               Drizzle ORM schema + migrations
  api-spec/         OpenAPI spec → Orval codegen (React Query hooks)
```

---

## Stack

- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui, Recharts, Wouter
- **Backend**: Express 5, Pino logger
- **Database**: PostgreSQL, Drizzle ORM
- **Validation**: Zod v4, drizzle-zod
- **API codegen**: Orval (OpenAPI → React Query + Zod)
- **Monorepo**: pnpm workspaces, TypeScript 5.9 strict

---

## Key Commands

```bash
pnpm run typecheck                        # Full typecheck across all packages
pnpm --filter @workspace/db run push      # Push schema changes to DB
pnpm --filter @workspace/api-spec run codegen  # Regenerate API hooks from OpenAPI spec
```

---

## Deployment

Two options — choose what fits your setup.

---

### Option A — Railway (full-stack, recommended)

One service handles both the API and the React frontend. `nixpacks.toml` and `railway.json` are already configured.

**1. Push to GitHub**
```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/chartink-monitor.git
git push -u origin main
```

**2. Create a Railway project**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select your repo.

**3. Add a PostgreSQL database**

Inside your Railway project → **+ New** → **Database** → **PostgreSQL**

Railway injects `DATABASE_URL` automatically — no copy-paste needed.

**4. Set environment variables**

In your Railway service → **Variables** tab:

| Variable | Value |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your group/channel chat ID |
| `SESSION_SECRET` | Any random 32-char string |

> `DATABASE_URL` and `PORT` are injected by Railway. Do not set them manually.

**5. Done** — Railway builds and deploys automatically. Live at `https://YOUR-APP.up.railway.app` in ~2 minutes.

In production, one Express process serves everything:
```
https://your-app.up.railway.app/        → React dashboard
https://your-app.up.railway.app/api/    → REST API
```

---

### Option B — Vercel (frontend) + Railway (API)

Deploy the dashboard to Vercel and the API to Railway separately.

**API on Railway** — same steps as Option A above, skip nothing.

**Dashboard on Vercel**:

1. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo
2. Vercel auto-detects `vercel.json` — no build config changes needed
3. In **Environment Variables** add:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your Railway API URL, e.g. `https://your-api.up.railway.app` |

4. Deploy. The dashboard calls the Railway API directly.

---

### Option C — Render / Fly.io / any Linux host

| Setting | Value |
|---------|-------|
| **Build** | `npm i -g pnpm@10 && pnpm i --frozen-lockfile && pnpm --filter @workspace/api-spec run codegen && pnpm run typecheck:libs && pnpm --filter @workspace/api-server run build && BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/dashboard run build && pnpm --filter @workspace/db run push --force` |
| **Start** | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |
| **Node** | 24 |
| **Env vars** | Same as Option A |

---

## License

MIT
