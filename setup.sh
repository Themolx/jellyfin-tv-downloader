#!/bin/bash
# Jellyfin TV Downloader - Setup Script

echo "🎬 Jellyfin TV Downloader Setup"
echo "================================"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found! Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. You have: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Install Playwright chromium
echo ""
echo "🌐 Installing Chromium browser..."
npx playwright install chromium

echo ""
echo "✅ Setup complete!"
echo ""
echo "📺 Quick start:"
echo "   node tv-downloader.js --list              # See available shows"
echo "   node tv-downloader.js --show south-park   # Download South Park"
echo "   node tv-downloader.js --help              # All options"
