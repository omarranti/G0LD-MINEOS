#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/omarranti/G0LD-MINEOS.git"
CACHE_DIR="${G0LD_MINEOS_DIR:-$HOME/Documents/GitHub/G0LD-MINEOS}"
SKILLS_DIR="$HOME/.claude/skills/g0ld-mineos"

GREEN='\033[0;32m'
RESET='\033[0m'
boot() { printf "${GREEN}%s${RESET}\n" "$1"; sleep 0.12; }

clear 2>/dev/null || true
printf "${GREEN}"
printf '%.0s▓' $(seq 1 78); echo
echo
cat <<'EOF'
  ____  ___  _     ____        __  __ ___ _   _ _____ ___  ____
 / ___|/ _ \| |   |  _ \      |  \/  |_ _| \ | | ____/ _ \/ ___|
| |  _| | | | |   | | | |_____| |\/| || ||  \| |  _|| | | \___ \
| |_| | |_| | |___| |_| |_____| |  | || || |\  | |__| |_| |___) |
 \____|\___/|_____|____/      |_|  |_|___|_| \_|_____\___/|____/
EOF
echo
printf '%.0s▓' $(seq 1 78); echo
printf "${RESET}\n"

boot "  BOOTING FEATURE LIBRARY INSTALLER..."
boot "  [ SYSTEM CHECK ]......................................... OK"

if [ -d "$CACHE_DIR/.git" ]; then
  boot "  [ REPO SYNC    ] existing checkout found, pulling latest..."
  git -C "$CACHE_DIR" pull --ff-only
else
  boot "  [ REPO SYNC    ] cloning to $CACHE_DIR ..."
  git clone "$REPO_URL" "$CACHE_DIR"
fi
boot "  [ REPO SYNC    ]......................................... OK"

mkdir -p "$SKILLS_DIR"
cp "$CACHE_DIR/skills/g0ld-mineos/SKILL.md" "$SKILLS_DIR/SKILL.md"
boot "  [ SKILL INSTALL] $SKILLS_DIR/SKILL.md............ OK"

echo
printf "${GREEN}  C:\\\\> WELCOME TO G0LD-MINEOS_${RESET}\n"
echo
echo "Start a new Claude Code session (or /clear) to pick it up."
