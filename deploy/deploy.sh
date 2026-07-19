#!/bin/bash
# deploy.sh — the ONLY thing the GitHub Actions SSH key is able to run.
#
# This lives at /home/deploy/deploy.sh on the VPS and is force-bound to the
# deploy user's SSH key via a `command=` restriction in authorized_keys
# (see DEPLOY_USER_SETUP.md). Even if the SSH private key leaks, or the
# GitHub Actions workflow YAML is tampered with, the server ignores
# whatever command was actually sent over that connection and always runs
# exactly this script instead — nothing else is reachable through that key.
#
# Runs as the unprivileged `deploy` user — no sudo, no root.

set -euo pipefail

APP_DIR="/var/www/animehunt-backend"
LOG_FILE="/home/deploy/deploy.log"

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG_FILE"; }

log "=== Deploy triggered ==="

cd "$APP_DIR"

log "Fetching latest main..."
git fetch origin main
git reset --hard origin/main

log "Installing production dependencies..."
npm ci --omit=dev

log "Reloading via PM2 (zero-downtime)..."
pm2 reload ecosystem.config.js --update-env

log "Deploy complete. Current commit: $(git rev-parse --short HEAD)"
