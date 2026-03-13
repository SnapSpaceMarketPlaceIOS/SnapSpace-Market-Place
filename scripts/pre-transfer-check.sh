#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SnapSpace Pre-Transfer Safety Check
# Run this BEFORE switching to Claude Code to ensure nothing is lost.
# Usage:  ./scripts/pre-transfer-check.sh
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

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  SnapSpace Pre-Transfer Safety Check${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 1. Check for uncommitted changes ────────────────────────────────
echo -e "${CYAN}1. Uncommitted Changes${NC}"

DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$DIRTY" -eq 0 ]; then
  pass "Working tree is clean — nothing to lose"
else
  fail "$DIRTY uncommitted file(s) detected!"
  echo ""
  git status --short
  echo ""
  echo -e "  ${RED}ACTION REQUIRED: Commit or stash before transferring.${NC}"
  echo -e "  ${RED}Run: git add -A && git commit -m 'checkpoint before Claude transfer'${NC}"
fi

# ── 2. Check for stashes that could be dropped ─────────────────────
echo ""
echo -e "${CYAN}2. Git Stashes${NC}"

STASH_COUNT=$(git stash list 2>/dev/null | wc -l | tr -d ' ')
if [ "$STASH_COUNT" -eq 0 ]; then
  pass "No stashes — nothing at risk of being dropped"
else
  warn "$STASH_COUNT stash(es) exist. Claude may drop these during worktree ops."
  echo ""
  git stash list
  echo ""
  echo -e "  ${YELLOW}TIP: Convert stashes to commits:${NC}"
  echo -e "  ${YELLOW}  git stash branch stash-backup${NC}"
fi

# ── 3. Verify all branches are tracked ─────────────────────────────
echo ""
echo -e "${CYAN}3. Branch Tracking${NC}"

CURRENT=$(git branch --show-current)
UPSTREAM=$(git rev-parse --abbrev-ref @{u} 2>/dev/null || echo "")

if [ -n "$UPSTREAM" ]; then
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "$UPSTREAM" 2>/dev/null || echo "")
  if [ "$LOCAL" = "$REMOTE" ]; then
    pass "Branch '$CURRENT' is up-to-date with '$UPSTREAM'"
  else
    AHEAD=$(git rev-list "$UPSTREAM"..HEAD --count 2>/dev/null || echo "?")
    fail "Branch '$CURRENT' is $AHEAD commit(s) ahead of '$UPSTREAM' — PUSH FIRST!"
    echo -e "  ${RED}Run: git push origin $CURRENT${NC}"
  fi
else
  warn "Branch '$CURRENT' has no upstream tracking. Push to create one."
  echo -e "  ${YELLOW}Run: git push -u origin $CURRENT${NC}"
fi

# ── 4. Snapshot current file counts ────────────────────────────────
echo ""
echo -e "${CYAN}4. Codebase Snapshot${NC}"

TOTAL_FILES=$(find src -name '*.js' -o -name '*.jsx' 2>/dev/null | wc -l | tr -d ' ')
SCREEN_COUNT=$(find src/screens -name '*.js' 2>/dev/null | wc -l | tr -d ' ')
COMPONENT_COUNT=$(find src/components -name '*.js' 2>/dev/null | wc -l | tr -d ' ')
HOMESCREEN_LINES=$(wc -l < src/screens/HomeScreen.js 2>/dev/null | tr -d ' ')

pass "Total JS files: $TOTAL_FILES"
pass "Screens: $SCREEN_COUNT"
pass "Components: $COMPONENT_COUNT"
pass "HomeScreen.js: $HOMESCREEN_LINES lines"

if [ "$HOMESCREEN_LINES" -lt 1500 ]; then
  warn "HomeScreen.js is only $HOMESCREEN_LINES lines (expected ~2000). Sections may be missing!"
fi

# ── 5. Record commit hash for verification after transfer ──────────
echo ""
echo -e "${CYAN}5. Transfer Reference${NC}"

HASH=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

pass "Current HEAD: $SHORT ($HASH)"
pass "Timestamp: $TIMESTAMP"
echo ""
echo -e "  ${BOLD}Save this hash. After Claude is done, verify with:${NC}"
echo -e "  ${BOLD}  git log --oneline | grep $SHORT${NC}"
echo -e "  ${BOLD}  If missing: git cherry-pick $HASH${NC}"

# ── 6. Check .env safety ───────────────────────────────────────────
echo ""
echo -e "${CYAN}6. Secrets Check${NC}"

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env is tracked by git — secrets are exposed!"
  echo -e "  ${RED}Run: git rm --cached .env${NC}"
else
  pass ".env is not tracked by git"
fi

if grep -q "^\.env" .gitignore 2>/dev/null; then
  pass ".env is in .gitignore"
else
  warn ".env is NOT in .gitignore"
fi

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}BLOCKED${NC} — $FAIL issue(s) must be fixed before transfer"
  echo -e "  ${GREEN}$PASS passed${NC}  ${YELLOW}$WARN warning(s)${NC}  ${RED}$FAIL failed${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "  ${YELLOW}${BOLD}READY (with warnings)${NC} — $WARN item(s) to review"
  echo -e "  ${GREEN}$PASS passed${NC}  ${YELLOW}$WARN warning(s)${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
else
  echo -e "  ${GREEN}${BOLD}ALL CLEAR${NC} — Safe to transfer to Claude"
  echo -e "  ${GREEN}$PASS passed${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
fi
