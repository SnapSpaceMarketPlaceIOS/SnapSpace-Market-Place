#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fal-prompt-variations-test.sh
#
# Build 44/45 diagnosis: determine why flux-2-pro/edit outputs the 2×2
# product panel instead of compositing products into the user's room photo.
#
# We run FOUR variations against FAL with the SAME seed so model randomness
# is controlled. Each variation's output image is downloaded to /tmp so we
# can inspect them visually.
#
#   v1 = current behavior (baseline reproducing the bug)
#   v2 = swapped image order + "edit image 2 (the room)" phrasing
#   v3 = current order + strong negative prompt ("NOT a product grid")
#   v4 = individual refs (room + 4 separate product images, no grid)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

set -a
source .env
set +a

SUPABASE_URL="$EXPO_PUBLIC_SUPABASE_URL"
ANON="$EXPO_PUBLIC_SUPABASE_ANON_KEY"
OUTDIR="/tmp/fal-variations-$(date +%s)"
mkdir -p "$OUTDIR"

# Fresh throwaway JWT
EMAIL="variations-$(date +%s)-$RANDOM@snapspace.test"
PASS="TestPass123!$RANDOM"
SIGNUP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
JWT=$(echo "$SIGNUP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or d.get('session',{}).get('access_token') or '')")
[ -z "$JWT" ] && { echo "✗ JWT signup failed"; exit 1; }

# All URLs below verified HTTP 200 before running (Unsplash-hosted).
# Room photo is an Architectural-Digest-style living room with white walls.
ROOM_URL="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1600&q=80"

# Reuse a known-working 2×2 panel from the user's prior generation. Confirmed
# publicly reachable via curl -I earlier in this investigation.
PANEL_URL="https://lqjfnpibbjymhzupqtda.supabase.co/storage/v1/object/public/room-uploads/product-panels/b06d3909-a3de-4c78-8bd8-93e82ff9b8c5/1776706614412.jpg"

# Four individual product images (for variation 4). Unsplash-hosted furniture
# images — confirmed 200 OK. Used in place of Amazon product URLs which FAL's
# fetcher has historically struggled with (auth/redirect).
P1_URL="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=512&q=80"       # sofa
P2_URL="https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=512&q=80"    # coffee table
P3_URL="https://images.unsplash.com/photo-1549497538-303791108f95?w=512&q=80"       # rug
P4_URL="https://images.unsplash.com/photo-1550226891-ef816aed4a98?w=512&q=80"       # armchair

SEED=424242
IMAGE_SIZE='{ "width": 1344, "height": 768 }'

# -----------------------------------------------------------------------------
# Helper: submit + poll + download. Takes a label, JSON body path, output name.
# -----------------------------------------------------------------------------
run_variation() {
  local label="$1"
  local body_file="$2"
  local out_name="$3"

  echo ""
  echo "────────────────────────────────────────────────────"
  echo "▶ $label"
  echo "────────────────────────────────────────────────────"

  local start=$(date +%s)
  local submit=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
    -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    --data @"$body_file")

  local request_id=$(echo "$submit" | python3 -c "import sys,json; print(json.load(sys.stdin).get('request_id',''))" 2>/dev/null || echo "")
  local status_url=$(echo "$submit" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status_url',''))" 2>/dev/null || echo "")
  local response_url=$(echo "$submit" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response_url',''))" 2>/dev/null || echo "")

  if [ -z "$request_id" ]; then
    echo "  ✗ SUBMIT FAILED:"
    echo "$submit" | python3 -m json.tool 2>/dev/null || echo "$submit"
    return 1
  fi
  echo "  submitted: $request_id"

  local status=""
  for i in $(seq 1 80); do
    sleep 3
    local status_res=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
      -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
      -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$status_url\"}")
    status=$(echo "$status_res" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "?")
    if [ "$status" = "COMPLETED" ]; then break; fi
    if [ "$status" = "FAILED" ]; then
      echo "  ✗ FAL returned FAILED:"
      echo "$status_res" | python3 -m json.tool 2>/dev/null || echo "$status_res"
      return 1
    fi
  done
  [ "$status" != "COMPLETED" ] && { echo "  ✗ timed out (status=$status)"; return 1; }

  local result=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
    -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$response_url\"}")
  local img_url=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('images') or [{}])[0].get('url',''))")
  local elapsed=$(($(date +%s) - start))

  if [ -z "$img_url" ]; then
    echo "  ✗ no image URL in result"
    echo "$result" | python3 -m json.tool
    return 1
  fi

  local out_path="$OUTDIR/$out_name.jpg"
  curl -s "$img_url" -o "$out_path"
  echo "  ✓ completed in ${elapsed}s"
  echo "    url: $img_url"
  echo "    saved: $out_path"
}

# -----------------------------------------------------------------------------
# Variation 1 — BASELINE (current buildPanelPrompt behavior)
# -----------------------------------------------------------------------------
V1_PROMPT='Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style. This is a precise scene edit, not a new generation. Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture. Image 2 is a 2×2 product reference grid showing the EXACT pieces to place in the room. top-left: beige linen boucle sofa. top-right: glass coffee table. bottom-left: wool area rug. bottom-right: cream armchair. Match each piece'"'"'s color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives. While maintaining this overall style intent: Modern minimal living room.'

cat > /tmp/v1.json <<JSON
{
  "provider": "fal", "method": "POST",
  "url": "https://queue.fal.run/fal-ai/flux-2-pro/edit",
  "body": {
    "prompt": $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$V1_PROMPT"),
    "image_urls": ["$ROOM_URL", "$PANEL_URL"],
    "image_size": $IMAGE_SIZE,
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": $SEED
  }
}
JSON
run_variation "V1: BASELINE (room=1, panel=2, current prompt)" /tmp/v1.json v1-baseline

# -----------------------------------------------------------------------------
# Variation 2 — SWAPPED ORDER (panel=1, room=2, "edit image 2" phrasing)
# -----------------------------------------------------------------------------
V2_PROMPT='Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style. This is a precise scene edit, not a new generation. Preserve image 2 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture. Image 1 is a 2×2 product reference grid showing the EXACT pieces to place into image 2 (the room). top-left: beige linen boucle sofa. top-right: glass coffee table. bottom-left: wool area rug. bottom-right: cream armchair. Match each piece'"'"'s color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives. The output should look like image 2 with new furniture placed inside it. While maintaining this overall style intent: Modern minimal living room.'

cat > /tmp/v2.json <<JSON
{
  "provider": "fal", "method": "POST",
  "url": "https://queue.fal.run/fal-ai/flux-2-pro/edit",
  "body": {
    "prompt": $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$V2_PROMPT"),
    "image_urls": ["$PANEL_URL", "$ROOM_URL"],
    "image_size": $IMAGE_SIZE,
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": $SEED
  }
}
JSON
run_variation "V2: SWAPPED (panel=1, room=2, edit-image-2)" /tmp/v2.json v2-swapped

# -----------------------------------------------------------------------------
# Variation 3 — NEGATIVE PROMPT (current order + strong anti-grid directive)
# -----------------------------------------------------------------------------
V3_PROMPT='Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style. The output MUST be a single interior photograph of the room in image 1 — NOT a product catalog, NOT a collage, NOT a grid, NOT multiple tiles. Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture. Image 2 is a 2×2 product reference grid showing the EXACT pieces to place inside the room shown in image 1. top-left tile in image 2: beige linen boucle sofa. top-right tile: glass coffee table. bottom-left tile: wool area rug. bottom-right tile: cream armchair. Treat image 2 ONLY as a reference for what the individual products look like. Place these four products naturally into the room in image 1 at realistic locations. The final output is a photograph of image 1'"'"'s room with the four products placed inside. Match each product'"'"'s color, material, silhouette, and proportions precisely. While maintaining this overall style intent: Modern minimal living room.'

cat > /tmp/v3.json <<JSON
{
  "provider": "fal", "method": "POST",
  "url": "https://queue.fal.run/fal-ai/flux-2-pro/edit",
  "body": {
    "prompt": $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$V3_PROMPT"),
    "image_urls": ["$ROOM_URL", "$PANEL_URL"],
    "image_size": $IMAGE_SIZE,
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": $SEED
  }
}
JSON
run_variation "V3: NEGATIVE PROMPT (strong anti-grid directive)" /tmp/v3.json v3-negative

# -----------------------------------------------------------------------------
# Variation 4 — INDIVIDUAL REFS (room + 4 product images, no panel)
# -----------------------------------------------------------------------------
V4_PROMPT='Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style. This is a precise scene edit, not a new generation. Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture. Place these four products inside the room shown in image 1: image 2 is a beige linen boucle sofa, image 3 is a glass coffee table, image 4 is a wool area rug, image 5 is a cream armchair. Match each product'"'"'s color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives. Position each piece naturally where it belongs in the room. The output is a single photograph of image 1'"'"'s room with the four products placed inside. While maintaining this overall style intent: Modern minimal living room.'

cat > /tmp/v4.json <<JSON
{
  "provider": "fal", "method": "POST",
  "url": "https://queue.fal.run/fal-ai/flux-2-pro/edit",
  "body": {
    "prompt": $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$V4_PROMPT"),
    "image_urls": ["$ROOM_URL", "$P1_URL", "$P2_URL", "$P3_URL", "$P4_URL"],
    "image_size": $IMAGE_SIZE,
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": $SEED
  }
}
JSON
run_variation "V4: INDIVIDUAL REFS (room + 4 product images, no grid)" /tmp/v4.json v4-individual

echo ""
echo "════════════════════════════════════════════════════════"
echo "All variations complete. Outputs at: $OUTDIR"
echo "════════════════════════════════════════════════════════"
ls -la "$OUTDIR"
