#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fal-e2e-test.sh — End-to-end verification that ai-proxy → FAL → polling →
#                   completed image URL works in production.
#
# Flow:
#   1. Sign up a throwaway user against Supabase auth → get real ES256 JWT
#   2. POST to ai-proxy with provider=fal → get FAL queue request_id/status_url
#   3. Poll status_url via ai-proxy every 3s until COMPLETED or FAILED
#   4. Fetch response_url via ai-proxy → print the final image URL
#
# Exits non-zero on any failure. Intended as a pre-build smoke test before
# flipping EXPO_PUBLIC_AI_PROVIDER=fal in production.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Load env
set -a
source .env
set +a

: "${EXPO_PUBLIC_SUPABASE_URL:?missing}"
: "${EXPO_PUBLIC_SUPABASE_ANON_KEY:?missing}"

SUPABASE_URL="$EXPO_PUBLIC_SUPABASE_URL"
ANON="$EXPO_PUBLIC_SUPABASE_ANON_KEY"

# ── 1. Sign up throwaway user ──────────────────────────────────────────────
EMAIL="fal-e2e-$(date +%s)-$RANDOM@snapspace.test"
PASS="TestPass123!$RANDOM"

echo "▶ Step 1/4: Signing up throwaway user ($EMAIL)..."
SIGNUP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

JWT=$(echo "$SIGNUP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or d.get('session',{}).get('access_token') or '')")

if [ -z "$JWT" ]; then
  echo "✗ Signup failed. Response:"
  echo "$SIGNUP" | python3 -m json.tool 2>/dev/null || echo "$SIGNUP"
  exit 1
fi

# Show alg (first . segment decoded) to confirm ES256
ALG=$(echo "$JWT" | cut -d. -f1 | base64 -d 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('alg','?'))" 2>/dev/null || echo "?")
echo "  ✓ Got JWT (alg=$ALG, len=${#JWT})"

# ── 2. Submit FAL generation through ai-proxy ──────────────────────────────
# Use stable public room photo + product image. Both CDN-hosted, known to work.
ROOM_URL="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1024&q=80"
PRODUCT_URL="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=512&q=80"

echo "▶ Step 2/4: Submitting FAL generation via ai-proxy..."
SUBMIT_START=$(date +%s)
SUBMIT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d @- <<JSON
{
  "provider": "fal",
  "method": "POST",
  "url": "https://queue.fal.run/fal-ai/flux-2-pro/edit",
  "body": {
    "prompt": "Editorial architectural photography. Preserve the room exactly. Place a modern minimalist accent chair naturally in the scene.",
    "image_urls": ["$ROOM_URL", "$PRODUCT_URL"],
    "image_size": { "width": 1024, "height": 1024 },
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": 42
  }
}
JSON
)
SUBMIT_DUR=$(($(date +%s) - SUBMIT_START))

REQUEST_ID=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('request_id',''))" 2>/dev/null || echo "")
STATUS_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status_url',''))" 2>/dev/null || echo "")
RESPONSE_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response_url',''))" 2>/dev/null || echo "")

if [ -z "$REQUEST_ID" ] || [ -z "$STATUS_URL" ] || [ -z "$RESPONSE_URL" ]; then
  echo "✗ FAL submit failed or returned malformed envelope. Raw response:"
  echo "$SUBMIT" | python3 -m json.tool 2>/dev/null || echo "$SUBMIT"
  exit 1
fi

echo "  ✓ Submitted in ${SUBMIT_DUR}s — request_id=$REQUEST_ID"
echo "    status_url:   $STATUS_URL"
echo "    response_url: $RESPONSE_URL"

# ── 3. Poll status_url through ai-proxy ────────────────────────────────────
echo "▶ Step 3/4: Polling status_url every 3s (max 80 attempts = 4 min)..."
POLL_START=$(date +%s)

for i in $(seq 1 80); do
  sleep 3
  STATUS_RES=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$STATUS_URL\"}")

  STATUS=$(echo "$STATUS_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "UNKNOWN")
  ELAPSED=$(($(date +%s) - POLL_START))

  printf "  poll %2d (t=%3ds): status=%s\n" "$i" "$ELAPSED" "$STATUS"

  if [ "$STATUS" = "COMPLETED" ]; then
    break
  fi

  if [ "$STATUS" = "FAILED" ]; then
    echo "✗ FAL reports FAILED. Raw status response:"
    echo "$STATUS_RES" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RES"
    exit 1
  fi

  if [ "$STATUS" = "UNKNOWN" ] || [ -z "$STATUS" ]; then
    echo "✗ Malformed status response on poll $i:"
    echo "$STATUS_RES" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RES"
    exit 1
  fi
done

if [ "$STATUS" != "COMPLETED" ]; then
  echo "✗ Timed out after $ELAPSED seconds without reaching COMPLETED."
  exit 1
fi

# ── 4. Fetch final result from response_url ────────────────────────────────
echo "▶ Step 4/4: Fetching result from response_url..."
RESULT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$RESPONSE_URL\"}")

IMAGE_URL=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('images') or [{}])[0].get('url',''))" 2>/dev/null || echo "")
SEED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('seed',''))" 2>/dev/null || echo "")

if [ -z "$IMAGE_URL" ]; then
  echo "✗ Result payload had no image URL. Raw response:"
  echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
  exit 1
fi

TOTAL=$(($(date +%s) - SUBMIT_START))
echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "✓ FAL END-TO-END SUCCESS"
echo "══════════════════════════════════════════════════════════════════"
echo "  Total time:  ${TOTAL}s (submit + poll + fetch)"
echo "  Seed:        $SEED"
echo "  Image URL:   $IMAGE_URL"
echo "══════════════════════════════════════════════════════════════════"
