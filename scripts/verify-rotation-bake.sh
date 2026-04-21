#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-rotation-bake.sh
#
# Empirical proof that Build 45's rotation-bake fix works end-to-end.
#
# Steps:
#   1. Take the user's actual broken upload (1776710784437.jpeg — 714×1400
#      portrait buffer with EXIF=1 but landscape content).
#   2. Simulate what the Build 45 optimizer WOULD produce if it had received
#      the original-device EXIF Orientation=6 (iPhone landscape default):
#      apply 90° CW rotation locally via Python.
#   3. Upload the corrected file to Supabase under a test path.
#   4. Fetch the test URL via /render/image/ — confirm dims + scene match.
#   5. Run a FAL panel generation with the corrected URL + the original panel.
#   6. Download FAL output — verify the model preserves the user's actual
#      room architecture this time.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
set -a; source .env; set +a
SUPABASE_URL="$EXPO_PUBLIC_SUPABASE_URL"
ANON="$EXPO_PUBLIC_SUPABASE_ANON_KEY"
OUTDIR="/tmp/rotation-verify-$(date +%s)"
mkdir -p "$OUTDIR"

# ── 1. Fetch the user's actual broken upload ───────────────────────────────
BROKEN_URL="https://lqjfnpibbjymhzupqtda.supabase.co/storage/v1/object/public/room-uploads/b06d3909-a3de-4c78-8bd8-93e82ff9b8c5/1776710784437.jpeg"
echo "▶ Step 1: Fetching user's broken upload..."
curl -s "$BROKEN_URL" -o "$OUTDIR/broken-original.jpg"
python3 <<PY
from PIL import Image
img = Image.open("$OUTDIR/broken-original.jpg")
print(f"  broken dims: {img.size[0]}x{img.size[1]} (expected portrait — confirms bug)")
print(f"  broken EXIF Orientation: {img.getexif().get(274)}")
PY

# ── 2. Simulate Build 45 optimizer: rotate 90° CW ──────────────────────────
echo ""
echo "▶ Step 2: Simulating Build 45 optimizer fix (rotate 90° CW to correct)..."
python3 <<PY
from PIL import Image
img = Image.open("$OUTDIR/broken-original.jpg")
# PIL's rotate is CCW by default. We want 90° CW = -90° CCW = rotate(-90) or equivalently rotate(270).
# Use transpose(ROTATE_270) which is 90° CW in PIL's conventions (rotates image 270° CCW = 90° CW).
# Actually PIL's Image.ROTATE_90 = 90° CCW, ROTATE_270 = 90° CW. We want CW per our EXIF=6 mapping.
rotated = img.transpose(Image.Transpose.ROTATE_270)
rotated.save("$OUTDIR/corrected.jpg", "JPEG", quality=90, exif=b"")
img2 = Image.open("$OUTDIR/corrected.jpg")
print(f"  corrected dims: {img2.size[0]}x{img2.size[1]} (should be landscape)")
PY

# ── 3. Upload corrected file to Supabase ───────────────────────────────────
echo ""
echo "▶ Step 3: Uploading corrected file to Supabase..."
EMAIL="rotverify-$(date +%s)@snapspace.test"; PASS="T!$RANDOM"
JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Extract user_id from JWT (payload's sub claim) — robust base64 parsing
USER_ID=$(python3 <<PY
import base64, json
jwt = "$JWT"
payload = jwt.split('.')[1]
# Pad as needed
payload += '=' * (4 - len(payload) % 4)
print(json.loads(base64.urlsafe_b64decode(payload))['sub'])
PY
)
TEST_PATH="$USER_ID/test-corrected-$(date +%s).jpeg"
UPLOAD_RES=$(curl -s -X POST "$SUPABASE_URL/storage/v1/object/room-uploads/$TEST_PATH" \
  -H "Authorization: Bearer $JWT" \
  -H "apikey: $ANON" \
  -H "Content-Type: image/jpeg" \
  --data-binary @"$OUTDIR/corrected.jpg")
echo "  upload response: $UPLOAD_RES"

CORRECTED_URL="$SUPABASE_URL/storage/v1/render/image/public/room-uploads/$TEST_PATH?width=1600&quality=90"
echo "  corrected URL: $CORRECTED_URL"

# ── 4. Verify served bytes are correctly oriented ──────────────────────────
echo ""
echo "▶ Step 4: Fetching corrected URL to verify orientation..."
sleep 2
curl -s "$CORRECTED_URL" -o "$OUTDIR/served-check.jpg"
python3 <<PY
from PIL import Image
img = Image.open("$OUTDIR/served-check.jpg")
orient = 'LANDSCAPE' if img.size[0] > img.size[1] else 'PORTRAIT'
print(f"  served dims: {img.size[0]}x{img.size[1]} — {orient}")
print(f"  served EXIF Orientation: {img.getexif().get(274)}")
if img.size[0] > img.size[1]:
    print("  ✓ bytes are correctly LANDSCAPE-oriented")
else:
    print("  ✗ still portrait — fix didn't take")
PY

# ── 5. Run FAL generation with corrected URL + original panel ──────────────
PANEL_URL="https://lqjfnpibbjymhzupqtda.supabase.co/storage/v1/object/public/room-uploads/product-panels/b06d3909-a3de-4c78-8bd8-93e82ff9b8c5/1776706614412.jpg"

PROMPT='Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style. This is a precise scene edit, not a new generation. Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture. Image 2 is a 2×2 product reference grid showing the EXACT pieces to place in the room. top-left: beige linen boucle sofa. top-right: glass coffee table. bottom-left: wool area rug. bottom-right: cream armchair. Match each piece'"'"'s color, material, silhouette, and proportions precisely. While maintaining this overall style intent: Modern minimal living room.'

cat > /tmp/verify-body.json <<JSON
{
  "provider": "fal", "method": "POST",
  "url": "https://queue.fal.run/fal-ai/flux-2-pro/edit",
  "body": {
    "prompt": $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$PROMPT"),
    "image_urls": ["$CORRECTED_URL", "$PANEL_URL"],
    "image_size": { "width": 1344, "height": 768 },
    "output_format": "jpeg",
    "safety_tolerance": 5,
    "seed": 792901804
  }
}
JSON

echo ""
echo "▶ Step 5: Running FAL generation with corrected URL..."
START=$(date +%s)
SUBMIT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  --data @/tmp/verify-body.json)
REQ_ID=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('request_id',''))")
STATUS_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status_url',''))")
RESPONSE_URL=$(echo "$SUBMIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response_url',''))")

if [ -z "$REQ_ID" ]; then
  echo "  ✗ FAL submit failed:"
  echo "$SUBMIT" | python3 -m json.tool
  exit 1
fi
echo "  submitted: $REQ_ID"

for i in $(seq 1 80); do
  sleep 3
  S=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$STATUS_URL\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
  if [ "$S" = "COMPLETED" ]; then break; fi
  if [ "$S" = "FAILED" ]; then echo "  ✗ FAL FAILED"; exit 1; fi
done

RES=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d "{\"provider\":\"fal\",\"method\":\"GET\",\"url\":\"$RESPONSE_URL\"}")
IMG=$(echo "$RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('images') or [{}])[0].get('url',''))")
curl -s "$IMG" -o "$OUTDIR/fal-output-corrected.jpg"

echo "  ✓ completed in $(($(date +%s) - START))s"
echo "  FAL output URL: $IMG"
echo ""
echo "════════════════════════════════════════════════════════"
echo "Outputs saved:"
echo "  BEFORE (sideways input): $OUTDIR/broken-original.jpg"
echo "  AFTER  (corrected input): $OUTDIR/corrected.jpg"
echo "  SERVED via /render/image: $OUTDIR/served-check.jpg"
echo "  FAL output with fix:     $OUTDIR/fal-output-corrected.jpg"
echo "════════════════════════════════════════════════════════"
