#!/usr/bin/env bash
set -e

BOLD="\033[1m"
TEAL="\033[36m"
GREEN="\033[32m"
RED="\033[31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}${TEAL}Chartink Scanner Monitor — Setup${RESET}"
echo "=================================================="

# ── 1. Check Node.js ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[1/5] Checking Node.js...${RESET}"
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
if [ "$NODE_VERSION" = "none" ]; then
  echo -e "${RED}Node.js not found. Install Node.js 20+ from https://nodejs.org${RESET}"
  exit 1
fi
echo -e "  Found Node.js $NODE_VERSION"

# ── 2. Check / install pnpm ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[2/5] Checking pnpm...${RESET}"
if ! command -v pnpm &>/dev/null; then
  echo "  pnpm not found — installing via npm..."
  npm install -g pnpm
fi
echo -e "  Found pnpm $(pnpm --version)"

# ── 3. Create .env from .env.example ────────────────────────────────────────
echo ""
echo -e "${BOLD}[3/5] Environment variables...${RESET}"
if [ -f ".env" ]; then
  echo -e "  .env already exists — skipping. Edit it manually if needed."
else
  cp .env.example .env

  echo ""
  echo -e "${TEAL}  Fill in the required values now:${RESET}"

  # DATABASE_URL
  echo ""
  echo -e "  ${BOLD}DATABASE_URL${RESET}"
  echo "  Free PostgreSQL: https://neon.tech (sign up, copy connection string)"
  printf "  Paste your DATABASE_URL: "
  read -r DB_URL
  if [ -n "$DB_URL" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
    else
      sed -i "s|DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
    fi
  fi

  # TELEGRAM_BOT_TOKEN
  echo ""
  echo -e "  ${BOLD}TELEGRAM_BOT_TOKEN${RESET}"
  echo "  Create a bot: open Telegram -> search @BotFather -> /newbot"
  printf "  Paste your bot token (or press Enter to skip): "
  read -r BOT_TOKEN
  if [ -n "$BOT_TOKEN" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$BOT_TOKEN|" .env
    else
      sed -i "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$BOT_TOKEN|" .env
    fi
  fi

  # TELEGRAM_CHAT_ID
  echo ""
  echo -e "  ${BOLD}TELEGRAM_CHAT_ID${RESET}"
  echo "  Add your bot to a group/channel, then get the ID from:"
  echo "  https://api.telegram.org/bot<TOKEN>/getUpdates"
  printf "  Paste your chat ID (or press Enter to skip): "
  read -r CHAT_ID
  if [ -n "$CHAT_ID" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|TELEGRAM_CHAT_ID=.*|TELEGRAM_CHAT_ID=$CHAT_ID|" .env
    else
      sed -i "s|TELEGRAM_CHAT_ID=.*|TELEGRAM_CHAT_ID=$CHAT_ID|" .env
    fi
  fi

  # SESSION_SECRET
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" .env
  else
    sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" .env
  fi

  echo ""
  echo -e "  ${GREEN}.env created.${RESET}"
fi

# Export .env into current shell
set -a
# shellcheck disable=SC1091
source .env
set +a

# ── 4. Install dependencies ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[4/5] Installing dependencies...${RESET}"
pnpm install

# ── 5. Push database schema ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[5/5] Pushing database schema...${RESET}"
if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = "postgresql://user:password@host:5432/dbname?sslmode=require" ]; then
  echo -e "${RED}  DATABASE_URL is not set. Edit .env and re-run this script.${RESET}"
  exit 1
fi
pnpm --filter @workspace/db run push --force
echo -e "  ${GREEN}Schema pushed.${RESET}"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Setup complete!${RESET}"
echo ""
echo "  Start the app:"
echo ""
echo -e "  ${TEAL}# Terminal 1 — API server${RESET}"
echo "  pnpm --filter @workspace/api-server run dev"
echo ""
echo -e "  ${TEAL}# Terminal 2 — Dashboard${RESET}"
echo "  pnpm --filter @workspace/dashboard run dev"
echo ""
echo "  Then open http://localhost:5173 in your browser."
echo ""
