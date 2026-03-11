#!/bin/bash
# Auto-deploy script for Render (teledesk / leadcash-analog)
# Pushes latest commits to GitHub → Render auto-deploys (autoDeploy: yes)
# Service: srv-d6kp2t6a2pns7394rkr0 | Repo: github.com/atigrtigrs-cmd/teledesk

set -e

echo "🚀 Pushing to GitHub (teledesk) → Render will auto-deploy..."

cd /home/ubuntu/leadcash-analog

# Push latest Manus commits to GitHub remote
git push github main 2>&1

echo "✅ Pushed to GitHub. Render will auto-deploy in ~3-5 minutes."
echo "🔗 Track at: https://dashboard.render.com/web/srv-d6kp2t6a2pns7394rkr0/deploys"
