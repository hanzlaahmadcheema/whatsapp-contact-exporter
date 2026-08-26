#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "===================================================="
echo "   🟢 WhatsApp Contact Exporter Launcher"
echo "===================================================="

if [ ! -d "node_modules" ]; then
    echo "📦 Node modules not found. Installing dependencies..."
    npm install
fi

if [ ! -d "dist" ]; then
    echo "⚙️ Building TypeScript project..."
    npm run build
fi

echo "🚀 Starting exporter wizard..."
npx tsx src/wizard.ts
