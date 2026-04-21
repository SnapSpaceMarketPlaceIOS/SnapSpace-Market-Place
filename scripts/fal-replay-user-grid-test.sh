#!/usr/bin/env bash
# Replay the user's actual Build 44 test to prove the "room photo" they
# uploaded was itself a 2×2 product grid.
set -euo pipefail
set -a; source .env; set +a
SUPABASE_URL="$EXPO_PUBLIC_SUPABASE_URL"
ANON="$EXPO_PUBLIC_SUPABASE_ANON_KEY"

EMAIL="grid-test-$(date +%s)@snapspace.test"; PASS="T!$RANDOM"
JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# User's ACTUAL uploaded "room photo" (which is really a panel)
ROOM="https://lqjfnpibbjymhzupqtda.supabase.co/storage/v1/render/image/public/room-uploads/b06d3909-a3de-4c78-8bd8-93e82ff9b8c5/1776709614672.jpeg?width=1600&quality=90"
# The panel that was composed for this test
PANEL="https://lqjfnpibbjymhzupqtda.supabase.co/storage/v1/object/public/room-uploads/product-panels/b06d3909-a3de-4c78-8bd8-93e82ff9b8c5/1776706614412.jpg"

PROMPT='Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style. This is a precise scene edit, not a new generation. Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture. Image 2 is a 2×2 product reference grid showing the EXACT pieces to place in the room. top-left: beige linen boucle sofa. top-right: glass coffee table. bottom-left: wool area rug. bottom-right: cream armchair. Match each piece'"'"'s color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives. While maintaining this overall style intent: Modern minimal living room, with white sofa.'

cat > /tmp/grid-replay.json <<JSON
{
  "provider": "fal", "method": "POST",
  "url": "https://queue.fal.run/fal-ai/flux-2-pro/edit",
  "body": {
    "prompt": $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$PROMPT"),
    "image_urls": ["$ROOM", "$PANEL"],
    "image_size": { "width": 1344, "height": 768 },
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": 549788892
  }
}
JSON

echo "▶ Replaying user's exact test (user's room URL + panel + seed 549788892)..."
START=$(date +%s)
SUBMIT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  --data @/tmp/grid-replay.json)
REQ_ID=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('request_id',''))")
STATUS_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status_url',''))")
RESPONSE_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response_url',''))")
echo "  submitted: $REQ_ID"

for i in $(seq 1 80); do
  sleep 3
  S=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$STATUS_URL\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
  if [ "$S" = "COMPLETED" ]; then break; fi
done

RES=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$RESPONSE_URL\"}")
IMG=$(echo "$RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('images') or [{}])[0].get('url',''))")
curl -s "$IMG" -o /tmp/user-replay-output.jpg
echo "  ✓ completed in $(($(date +%s) - START))s"
echo "  output: $IMG"
echo "  saved:  /tmp/user-replay-output.jpg"
