#!/usr/bin/env bash
# Starts the full demo locally.
#   - Backend (FastAPI via uvicorn on :8000) opens in a NEW terminal tab.
#   - Frontend (Vite on :5173) runs in the tab where this script was called.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_CMD="cd '$BACKEND_DIR' && uv run uvicorn strategy_compiler.api:app --port 8000; exec bash"

open_backend_tab() {
  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --tab --title="backend" -- bash -c "$BACKEND_CMD"
  elif command -v konsole >/dev/null 2>&1; then
    konsole --new-tab -e bash -c "$BACKEND_CMD"
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal --tab --title="backend" -e "bash -c \"$BACKEND_CMD\""
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -e bash -c "$BACKEND_CMD" &
  else
    echo "No supported terminal emulator found (tried gnome-terminal, konsole, xfce4-terminal, x-terminal-emulator)." >&2
    echo "Start the backend manually in another terminal:" >&2
    echo "  $BACKEND_CMD" >&2
    return 1
  fi
}

echo "Opening backend tab (http://127.0.0.1:8000) ..."
open_backend_tab || echo "Continuing with frontend only." >&2

echo "Starting frontend in this tab (http://localhost:5173) ..."
cd "$FRONTEND_DIR"
exec npm run dev
