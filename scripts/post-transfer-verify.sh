#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SnapSpace Post-Transfer Verification
# Run this AFTER returning from Claude Code to verify nothing was lost.
# Usage:  ./scripts/post-transfer-verify.sh [expected_commit_hash]
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

PASS=0
FAIL=0
WARN=0

pass()  { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail()  { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; WARN=$((WARN+1)); }

cd "$(dirname "$0")/.."

EXPECTED_HASH="${1:-}"

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  SnapSpace Post-Transfer Verification${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 1. Verify commit is in history ─────────────────────────────────
echo -e "${CYAN}1. Commit Ancestry${NC}"

if [ -n "$EXPECTED_HASH" ]; then
  SHORT_EXPECTED=$(echo "$EXPECTED_HASH" | head -c 7)
  if git merge-base --is-ancestor "$EXPECTED_HASH" HEAD 2>/dev/null; then
    pass "Pre-transfer commit $SHORT_EXPECTED is in current history"
  else
    fail "Pre-transfer commit $SHORT_EXPECTED is NOT in current history!"
    echo -e "  ${RED}Your pre-transfer work may have been lost.${NC}"
    echo -e "  ${RED}Recovery: git cherry-pick $EXPECTED_HASH${NC}"
  fi
else
  warn "No expected hash provided. Run with: ./scripts/post-transfer-verify.sh <hash>"
fi

echo ""
echo -e "${CYAN}2. Recent History${NC}"
git log --oneline -10
echo ""

# ── 3. Check for dropped stashes ──────────────────────────────────
echo -e "${CYAN}3. Dangling Objects${NC}"

DANGLING=$(git fsck --lost-found 2>&1 | grep "dangling commit" | wc -l | tr -d ' ')
if [ "$DANGLING" -gt 0 ]; then
  warn "$DANGLING dangling commit(s) found — may contain dropped stash work"
  git fsck --lost-found 2>&1 | grep "dangling commit"
  echo ""
  echo -e "  ${YELLOW}Inspect with: git show <hash> --stat${NC}"
else
  pass "No dangling commits — nothing was dropped"
fi

# ── 4. Critical file checks ───────────────────────────────────────
echo ""
echo -e "${CYAN}4. Critical Files${NC}"

HOMESCREEN_LINES=$(wc -l < src/screens/HomeScreen.js 2>/dev/null | tr -d ' ')
if [ "$HOMESCREEN_LINES" -ge 1900 ]; then
  pass "HomeScreen.js: $HOMESCREEN_LINES lines (full content present)"
elif [ "$HOMESCREEN_LINES" -ge 1500 ]; then
  warn "HomeScreen.js: $HOMESCREEN_LINES lines (may be missing sections)"
else
  fail "HomeScreen.js: $HOMESCREEN_LINES lines (MAJOR content missing — was ~2001)"
fi

EXPECTED_SECTIONS=("SHOP BY ROOM" "PICKED FOR YOU" "TRENDING" "FEATURED" "NEW ARRIVALS" "Curated Collections" "Shop By Style" "Deal of the Day" "Recently Viewed")
for section in "${EXPECTED_SECTIONS[@]}"; do
  if grep -q "$section" src/screens/HomeScreen.js 2>/dev/null; then
    pass "HomeScreen section: '$section'"
  else
    fail "HomeScreen MISSING section: '$section'"
  fi
done

CRITICAL_FILES=(
  "src/constants/tokens.js"
  "src/constants/theme.js"
  "src/components/ds/Button.js"
  "src/components/ds/Badge.js"
  "src/components/ds/SectionHeader.js"
  "src/components/ds/index.js"
  "src/context/CartContext.js"
  "src/context/AuthContext.js"
  "CLAUDE.md"
)
for f in "${CRITICAL_FILES[@]}"; do
  if [ -f "$f" ]; then
    LINES=$(wc -l < "$f" | tr -d ' ')
    pass "$f ($LINES lines)"
  else
    fail "MISSING: $f"
  fi
done

# ── 5. Screen count check ─────────────────────────────────────────
echo ""
echo -e "${CYAN}5. File Counts${NC}"

SCREEN_COUNT=$(find src/screens -name '*.js' 2>/dev/null | wc -l | tr -d ' ')
COMPONENT_COUNT=$(find src/components -name '*.js' 2>/dev/null | wc -l | tr -d ' ')

if [ "$SCREEN_COUNT" -ge 28 ]; then
  pass "Screens: $SCREEN_COUNT (expected ≥28)"
else
  fail "Screens: $SCREEN_COUNT (expected ≥28 — files may have been deleted)"
fi

if [ "$COMPONENT_COUNT" -ge 8 ]; then
  pass "Components: $COMPONENT_COUNT (expected ≥8)"
else
  fail "Components: $COMPONENT_COUNT (expected ≥8)"
fi

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}ISSUES DETECTED${NC} — $FAIL problem(s) found"
  echo -e "  ${GREEN}$PASS passed${NC}  ${YELLOW}$WARN warning(s)${NC}  ${RED}$FAIL failed${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "  ${YELLOW}${BOLD}OK (with warnings)${NC}"
  echo -e "  ${GREEN}$PASS passed${NC}  ${YELLOW}$WARN warning(s)${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
else
  echo -e "  ${GREEN}${BOLD}ALL VERIFIED${NC} — Everything survived the transfer"
  echo -e "  ${GREEN}$PASS passed${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
fi
