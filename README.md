# 🎬 Jellyfin TV Downloader

Download **all Czech-dubbed TV shows** from nahnoji.cz and prehrajto.cz, automatically organized for [Jellyfin](https://jellyfin.org/).

## 📺 What You Get

**22 shows, 2,072 episodes** including:
- South Park (280 eps)
- Simpsonovi (523 eps) 
- Big Bang Theory (169 eps)
- Futurama (140 eps)
- Rick & Morty (71 eps)
- Family Guy, Comeback, House, and 15 more!

## 🚀 Quick Start

```bash
# 1. Setup (one time)
chmod +x setup.sh && ./setup.sh

# 2. Download EVERYTHING
node tv-downloader.js --all --output /path/to/your/jellyfin/TVShows
```

That's it! ☕ Grab a coffee, this will take a while (~300GB).

## 💻 More Commands

```bash
# See what's available
node tv-downloader.js --list

# Check progress
node tv-downloader.js --status

# Download just one show
node tv-downloader.js --show south-park --output ~/Movies/TVShows

# Preview without downloading
node tv-downloader.js --dry-run --all
```

# Download all shows
node tv-downloader.js --all --output ~/Movies/TVShows

# Preview without downloading
node tv-downloader.js --show simpsonovi --dry-run

# Limit number of episodes
node tv-downloader.js --show south-park --limit 5
```

## 📁 Jellyfin-Compatible Output

Files are automatically organized for Jellyfin:

```
TVShows/
├── South Park/
│   ├── Season 01/
│   │   ├── South Park - S01E01 - Cartman dostava analni sondu.mp4
│   │   ├── South Park - S01E02 - Posilovac 4000.mp4
│   │   └── ...
│   └── Season 02/
│       └── ...
├── Simpsonovi/
│   └── ...
```

Just point Jellyfin to your output directory and it will auto-detect everything!

## 📋 Requirements

- Node.js 18+
- macOS, Linux, or Windows (with WSL)
- ~500MB for Chromium browser

## ⚙️ How It Works

1. Uses Playwright to open video pages in a headless browser
2. Extracts the video stream URL from the page
3. Downloads using `curl` with proper headers
4. Organizes files for Jellyfin

## 🔧 Troubleshooting

**Browser issues?**
```bash
npx playwright install chromium
```

**Show not downloading?**
- Check if the source site is up
- Try running with `--limit 1` to test one episode
- Videos may have been removed from the source

**Slow downloads?**
- Use `--limit 3` to download fewer at once
- Downloads use parallel streams (3 by default)

## 📝 Adding New Shows

1. Create a JSON file in `shows/` folder
2. Follow the format of existing files:

```json
{
  "showName": "My Show",
  "source": "nahnoji.cz",
  "seasons": [
    {
      "season": 1,
      "episodes": [
        {
          "episode": 1,
          "title": "Episode Title",
          "url": "http://nahnoji.cz/video?id=XXX",
          "status": "pending"
        }
      ]
    }
  ]
}
```

---

Made with ❤️ for archiving Czech-dubbed TV classics
