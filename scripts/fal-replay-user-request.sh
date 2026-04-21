#!/usr/bin/env bash
# Replay the EXACT FAL request the user made (request_id 019dabf7-77cb-79c2-8e04-b0b6a1de50f2)
# to see if it completes successfully end-to-end. This tells us whether the client failed to
# handle a successful FAL response, or whether FAL itself is rejecting / timing out.
set -euo pipefail

set -a
source .env
set +a

SUPABASE_URL="$EXPO_PUBLIC_SUPABASE_URL"
ANON="$EXPO_PUBLIC_SUPABASE_ANON_KEY"

# Get a fresh user JWT
EMAIL="replay-$(date +%s)-$RANDOM@snapspace.test"
PASS="TestPass123!$RANDOM"
SIGNUP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
JWT=$(echo "$SIGNUP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or d.get('session',{}).get('access_token') or '')")
echo "▶ Got JWT (alg=$(echo "$JWT" | cut -d. -f1 | base64 -d 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('alg','?'))" 2>/dev/null || echo "?"))"

# User's exact URLs (from image 2)
ROOM_URL="https://lqjfnpibbjymhzupqtda.supabase.co/storage/v1/render/image/public/room-uploads/b06d3909-a3de-4c78-8bd8-93e82ff9b8c5/1776706610657.jpeg?width=1600&quality=90"
PANEL_URL="https://lqjfnpibbjymhzupqtda.supabase.co/storage/v1/object/public/room-uploads/product-panels/b06d3909-a3de-4c78-8bd8-93e82ff9b8c5/1776706614412.jpg"

echo "▶ Submitting flux-2-pro/edit with user's exact inputs..."
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
    "prompt": "Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style. This is a precise scene edit, not a new generation. Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture. Image 2 is a 2×2 product reference grid showing the EXACT pieces to place in the room. top-left: beige linen minimalist 3-seater sofa. top-right: marble round coffee table. bottom-left: beige linen area rug. bottom-right: ivory velvet clear armchair accent chair. Match each piece's color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives. While maintaining this overall style intent: Modern minimal living room.",
    "image_urls": ["$ROOM_URL", "$PANEL_URL"],
    "image_size": { "width": 768, "height": 1344 },
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": 899253201
  }
}
JSON
)

REQUEST_ID=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('request_id',''))")
STATUS_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status_url',''))")
RESPONSE_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response_url',''))")

if [ -z "$REQUEST_ID" ]; then
  echo "✗ Submit failed. Response:"
  echo "$SUBMIT" | python3 -m json.tool
  exit 1
fi
echo "  ✓ Submitted, request_id=$REQUEST_ID"

echo "▶ Polling..."
for i in $(seq 1 80); do
  sleep 3
  STATUS_RES=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$STATUS_URL\"}")
  STATUS=$(echo "$STATUS_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "PARSE_ERROR")
  ELAPSED=$(($(date +%s) - SUBMIT_START))
  printf "  poll %2d (t=%3ds): status=%s\n" "$i" "$ELAPSED" "$STATUS"

  if [ "$STATUS" = "COMPLETED" ]; then break; fi
  if [ "$STATUS" = "FAILED" ]; then
    echo ""
    echo "✗✗✗ FAL returned FAILED. Full response:"
    echo "$STATUS_RES" | python3 -m json.tool
    exit 1
  fi
  if [ "$STATUS" = "PARSE_ERROR" ] || [ -z "$STATUS" ]; then
    echo "✗ Malformed status response:"
    echo "$STATUS_RES" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RES"
    exit 1
  fi
done

if [ "$STATUS" != "COMPLETED" ]; then
  echo "✗ Timed out after ${ELAPSED}s"
  exit 1
fi

echo "▶ Fetching result..."
RESULT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$RESPONSE_URL\"}")
IMG=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('images') or [{}])[0].get('url',''))")
SEED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('seed',''))")
TIMINGS=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('timings',{}))")

TOTAL=$(($(date +%s) - SUBMIT_START))
echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "✓ COMPLETED in ${TOTAL}s"
echo "  Seed:       $SEED"
echo "  Timings:    $TIMINGS"
echo "  Image URL:  $IMG"
echo "══════════════════════════════════════════════════════════════════"
