#!/bin/bash
echo "==================================================="
echo "          MILLORA POS - ONE-CLICK INSTALLER"
echo "==================================================="
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please download and install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[OK] Node.js detected: $(node -v)"
echo ""

# 2. Check and install dependencies
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install dependencies."
        exit 1
    fi
    echo "[OK] Dependencies installed!"
    echo ""
fi

# 3. Start server and open browser
echo "Starting Millora POS at http://localhost:3000 ..."
sleep 2 && (xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null) &
node server.js
