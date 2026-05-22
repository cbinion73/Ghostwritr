#!/bin/bash
# Load API keys directly from .env (bypasses Claude Code's empty ANTHROPIC_API_KEY override)
export ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' "$(dirname "$0")/.env" | cut -d'=' -f2-)"
export OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' "$(dirname "$0")/.env" | cut -d'=' -f2-)"
export GOOGLE_GENERATIVE_AI_API_KEY="$(grep '^GOOGLE_GENERATIVE_AI_API_KEY=' "$(dirname "$0")/.env" | cut -d'=' -f2-)"
unset NODE_OPTIONS
cd "$(dirname "$0")"

# Print Tailscale address if available
TAILSCALE_IP="$(tailscale ip -4 2>/dev/null)"
if [ -n "$TAILSCALE_IP" ]; then
  echo "  Tailscale:  http://${TAILSCALE_IP}:3000"
fi

exec npm run dev
