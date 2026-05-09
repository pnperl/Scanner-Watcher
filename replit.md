# Chartink Scanner Monitor

A production-ready Chartink scanner monitoring app that polls stock screeners, sends Telegram alerts, and displays results on a live dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/dashboard run dev` — run the React dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Recharts + Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Alerts: Telegram Bot API

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/scanners.ts` — Scanner table
- `lib/db/src/schema/alerts.ts` — Alert table
- `artifacts/api-server/src/lib/chartink.ts` — Chartink POST API client
- `artifacts/api-server/src/lib/telegram.ts` — Telegram alert sender
- `artifacts/api-server/src/lib/poller.ts` — Per-scanner polling scheduler
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/dashboard/src/` — React frontend
- `railway.json` + `nixpacks.toml` — Railway deployment config

## Architecture decisions

- **Polling is per-scanner timer based**: Each scanner gets its own `setTimeout` loop using its configured interval. Timers are started/stopped when scanners are enabled/disabled.
- **Duplicate prevention**: Alerts are deduplicated per symbol per scanner per calendar day (IST). Only new symbols trigger Telegram messages.
- **Anti-IP-block**: Random User-Agent rotation, random delays between CSRF fetch and scan POST, proper Referer/Origin headers to mimic a real browser session.
- **CSRF flow**: Chartink requires a CSRF token fetched from the screener page before POSTing. The poller fetches it fresh per scan.
- **Auto-restart on Railway**: `railway.json` sets `restartPolicyType: ON_FAILURE` with 10 retries.

## Product

- Dashboard with live stats (active scanners, alerts today, total alerts, last scan time)
- Per-scanner activity bar chart
- Real-time recent signals feed
- Scanner management: add, edit, enable/disable, manual trigger
- Full alert log with scanner filter and Telegram status

## User preferences

- Dark-first UI with teal/cyan accent and red/green signal colors
- No emojis in UI
- Dashboard auto-refreshes every 30 seconds

## Gotchas

- Chartink requires CSRF token + correct headers — see `chartink.ts`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` must be set for alerts to fire
- Railway deployment uses `nixpacks.toml` for build steps
- Poller starts automatically when the API server boots

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
