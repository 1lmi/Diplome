#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/sc-restaurant-front"
COURIER_DIR="$ROOT_DIR/sc-restaurant-courier-mobile"
VENV_DIR="$ROOT_DIR/.venv"
PYTHON_EXE="$VENV_DIR/bin/python3"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
COURIER_API_BASE_URL="${COURIER_API_BASE_URL:-}"

fail() {
  echo "Error: $1" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$1 was not found in PATH. Install it and try again."
  fi
}

ensure_python_venv() {
  if [[ -x "$PYTHON_EXE" ]]; then
    return
  fi

  require_cmd python3
  echo "Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
}

ensure_backend_deps() {
  echo "Checking backend dependencies..."
  if PYTHONPYCACHEPREFIX=/tmp/pycache "$PYTHON_EXE" -c "import fastapi, uvicorn, multipart" >/dev/null 2>&1; then
    return
  fi

  echo "Installing backend dependencies..."
  "$PYTHON_EXE" -m pip install --upgrade pip
  "$PYTHON_EXE" -m pip install fastapi "uvicorn[standard]" python-multipart
}

ensure_node_deps() {
  local project_dir="$1"

  if [[ -d "$project_dir/node_modules" ]]; then
    return
  fi

  echo "Installing dependencies in $(basename "$project_dir")..."
  (
    cd "$project_dir"
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  )
}

detect_lan_ip() {
  local default_interface
  default_interface="$(route get default 2>/dev/null | awk '/interface: / {print $2; exit}')"

  if [[ -n "$default_interface" ]]; then
    ipconfig getifaddr "$default_interface" 2>/dev/null || true
    return
  fi

  ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}'
}

escape_for_osascript() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

launch_terminal_window() {
  local command="$1"
  local escaped
  escaped="$(escape_for_osascript "$command")"

  osascript \
    -e 'tell application "Terminal" to activate' \
    -e "tell application \"Terminal\" to do script \"$escaped\"" >/dev/null
}

require_cmd npm
require_cmd osascript
ensure_python_venv
ensure_backend_deps
ensure_node_deps "$FRONTEND_DIR"
ensure_node_deps "$COURIER_DIR"

if [[ -n "$COURIER_API_BASE_URL" ]]; then
  EFFECTIVE_COURIER_API_BASE_URL="${COURIER_API_BASE_URL%/}"
else
  LAN_IP="$(detect_lan_ip)"
  if [[ -z "$LAN_IP" ]]; then
    LAN_IP="127.0.0.1"
  fi
  EFFECTIVE_COURIER_API_BASE_URL="http://$LAN_IP:$BACKEND_PORT"
fi

BACKEND_COMMAND="cd $(printf '%q' "$ROOT_DIR") && PYTHONPYCACHEPREFIX=/tmp/pycache $(printf '%q' "$PYTHON_EXE") -m uvicorn main:app --reload --host 0.0.0.0 --port $BACKEND_PORT"
FRONTEND_COMMAND="cd $(printf '%q' "$FRONTEND_DIR") && npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT"
COURIER_COMMAND="cd $(printf '%q' "$COURIER_DIR") && EXPO_PUBLIC_API_BASE_URL=$(printf '%q' "$EFFECTIVE_COURIER_API_BASE_URL") npm run start:lan"

echo "Starting backend in a new Terminal window..."
launch_terminal_window "$BACKEND_COMMAND"

sleep 1

echo "Starting website in a new Terminal window..."
launch_terminal_window "$FRONTEND_COMMAND"

sleep 1

echo "Starting courier Expo app in a new Terminal window..."
launch_terminal_window "$COURIER_COMMAND"

cat <<INFO

Launch started.
Backend:  http://127.0.0.1:$BACKEND_PORT/docs
Website:  http://127.0.0.1:$FRONTEND_PORT
Courier API: $EFFECTIVE_COURIER_API_BASE_URL

Notes:
- Open the courier app in Expo Go from the Terminal window that started Expo.
- The phone must be on the same Wi‑Fi network as this Mac.
- If you want a different backend port, run:
    BACKEND_PORT=8010 ./start-site-and-courier.command
- If LAN IP detection is wrong, run:
    COURIER_API_BASE_URL=http://192.168.1.50:8000 ./start-site-and-courier.command
INFO
