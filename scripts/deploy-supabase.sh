#!/usr/bin/env bash
# ── GluciAI — one-shot Supabase setup ──────────────────────────────────
# Links the project, pushes the DB schema, sets server-side secrets, and
# deploys all Edge Functions. Idempotent: safe to re-run.
#
# Usage:
#   1) Log in once:            supabase login
#   2) Export your secrets (see below), then:
#        bash scripts/deploy-supabase.sh <project-ref>
#
#   <project-ref> is the ref in your project URL:
#        https://<project-ref>.supabase.co
#
# Secrets are read from the ENVIRONMENT (never hardcoded). Set the ones you
# use before running, e.g.:
#        export GEMINI_API_KEY=AIza...
#        export FATSECRET_CLIENT_ID=...   FATSECRET_CLIENT_SECRET=...
#        export EDAMAM_APP_ID=...         EDAMAM_APP_KEY=...
#        export OPENAI_API_KEY=sk-...     # only if you use ai-chat
set -euo pipefail

PROJECT_REF="${1:-}"
if [[ -z "$PROJECT_REF" ]]; then
  echo "✗ Missing project ref."
  echo "  Usage: bash scripts/deploy-supabase.sh <project-ref>"
  echo "  (find it in your URL: https://<project-ref>.supabase.co)"
  exit 1
fi

# Run supabase via npx so no global install is required.
SB="npx --yes supabase"

echo "▸ Linking project $PROJECT_REF …"
$SB link --project-ref "$PROJECT_REF"

echo "▸ Pushing database migrations …"
$SB db push

# ── Secrets ────────────────────────────────────────────────────────────
# Only set a secret if its env var is present, so partial setups work.
set_secret () {
  local name="$1"
  local value="${!name:-}"
  if [[ -n "$value" ]]; then
    echo "  • setting $name"
    $SB secrets set "$name=$value" >/dev/null
  else
    echo "  • skip $name (not exported)"
  fi
}

echo "▸ Setting Edge Function secrets …"
set_secret GEMINI_API_KEY          # required — scanner vision
set_secret GEMINI_VISION_MODEL     # optional — defaults to gemini-2.5-flash
set_secret OPENAI_API_KEY          # optional — ai-chat
set_secret FATSECRET_CLIENT_ID     # optional — FatSecret provider
set_secret FATSECRET_CLIENT_SECRET
set_secret EDAMAM_APP_ID           # optional — Edamam provider
set_secret EDAMAM_APP_KEY

# ── Edge Functions ─────────────────────────────────────────────────────
echo "▸ Deploying Edge Functions …"
$SB functions deploy analyze-meal
$SB functions deploy nutrition-search
$SB functions deploy ai-chat

echo ""
echo "✓ Done. Next:"
echo "  1) Put the project URL + anon key into .env"
echo "     (Supabase → Project Settings → API)"
echo "  2) Restart Expo:  npx expo start -c"
