#!/usr/bin/env bash
# Wrapper for the Vercel build step.
#
# In production, `npx convex deploy` occasionally fails because api.convex.dev
# returns 500 on the url_for_key call before our app build even starts. That's a
# Convex control-plane flake, not a repo problem, and it's bricked several
# consecutive deploys. This wrapper retries *only* that specific transient
# signature — real build failures (TypeScript errors, ESLint violations, Vite
# errors) still fail immediately on the first attempt.
set -eo pipefail

if [ "$VERCEL_ENV" != "production" ]; then
  exec npm run build
fi

# Exponential backoff — 30, 60, 120, 240s between attempts. Five attempts
# total buys ~8 minutes of outage tolerance, which covers all convex.dev
# control-plane blips seen so far without blowing through Vercel's build time.
MAX_ATTEMPTS=5
attempt=1
backoff=30

while true; do
  tmp=$(mktemp)
  set +e
  npx convex deploy --cmd 'npm run build' 2>&1 | tee "$tmp"
  code=${PIPESTATUS[0]}
  set -e

  if [ "$code" -eq 0 ]; then
    rm -f "$tmp"
    exit 0
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ] \
     && grep -q "api.convex.dev" "$tmp" \
     && grep -qE "(500 Internal Server Error|InternalServerError)" "$tmp"; then
    echo ""
    echo "convex deploy hit transient api.convex.dev error (attempt $attempt/$MAX_ATTEMPTS); retrying in ${backoff}s..."
    rm -f "$tmp"
    attempt=$((attempt + 1))
    sleep "$backoff"
    backoff=$((backoff * 2))
    continue
  fi

  rm -f "$tmp"
  exit "$code"
done
