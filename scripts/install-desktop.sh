#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/256x256/apps"
cp "$ROOT/assets/icon.png" "$HOME/.local/share/icons/hicolor/256x256/apps/retro-studio.png"
cat > "$HOME/.local/share/applications/retro-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=RETRO Studio
Comment=MAGIC Studio for the C64, Apple II, and TI-99/4A
Exec=$ROOT/bin/retro-studio %F
Icon=retro-studio
Terminal=false
Categories=Development;IDE;
StartupWMClass=retro-studio
EOF
chmod +x "$ROOT/bin/retro-studio"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" || true
fi
echo "Installed RETRO Studio in the application menu."
