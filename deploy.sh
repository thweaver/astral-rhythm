#!/usr/bin/env bash
# deploy.sh — deploy pirate-radio to DreamHost VPS
# Usage: ./deploy.sh user@your-vps-ip [/opt/pirate-radio]
set -euo pipefail

REMOTE="${1:?Usage: ./deploy.sh user@host [deploy_path]}"
DEPLOY_PATH="${2:-/opt/pirate-radio}"
APP_NAME="pirate-radio"

echo "→ Deploying to $REMOTE:$DEPLOY_PATH"

# Sync files (exclude dev artefacts)
rsync -avz --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  ./ "$REMOTE:$DEPLOY_PATH/"

echo "→ Installing dependencies"
ssh "$REMOTE" "cd $DEPLOY_PATH && npm install --omit=dev"

echo "→ Starting/reloading app with PM2"
ssh "$REMOTE" "cd $DEPLOY_PATH && \
  pm2 describe $APP_NAME > /dev/null 2>&1 \
    && pm2 reload $APP_NAME \
    || pm2 start server/index.js --name $APP_NAME --time"

ssh "$REMOTE" "pm2 save"

echo "✓ Deployed. Run 'pm2 logs $APP_NAME' on the server to check logs."
