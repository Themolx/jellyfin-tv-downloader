<p align="center">
  <img src="assets/chumper_hue_0.png" width="80" alt="Chumper Red">
  <img src="assets/chumper_hue_120.png" width="80" alt="Chumper Green">
  <img src="assets/chumper_hue_240.png" width="80" alt="Chumper Blue">
</p>

<h1 align="center">🎬 Jellyfin TV Downloader</h1>

<p align="center">
  <strong>Download all Czech-dubbed TV shows for your Jellyfin server</strong><br>
  <em>nahnoji.cz • prehrajto.cz → Jellyfin-ready</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/shows-24-blue?style=flat-square" alt="Shows">
  <img src="https://img.shields.io/badge/episodes-2,381-green?style=flat-square" alt="Episodes">
  <img src="https://img.shields.io/badge/size-~350GB-orange?style=flat-square" alt="Size">
  <img src="https://img.shields.io/badge/node-18+-brightgreen?style=flat-square" alt="Node">
</p>

---

## 📺 What You Get

**24 shows, 2,381 episodes** including:
- Simpsonovi (523 eps)
- South Park (280 eps)
- **Přátelé / Friends** (235 eps) 🆕
- Dva a půl chlapa (200 eps)
- Big Bang Theory (169 eps)
- Futurama (140 eps)
- **Red Dwarf** (74 eps) 🆕
- Rick & Morty, Family Guy, Comeback + 14 more!

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/Themolx/jellyfin-tv-downloader.git
cd jellyfin-tv-downloader

# Setup (one time)
chmod +x setup.sh && ./setup.sh

# Download EVERYTHING 🔥
node tv-downloader.js --all --output /path/to/jellyfin/TVShows
```

> ☕ Grab a coffee (or three). This downloads ~300GB of pure nostalgia.

---

## 💻 Commands

| Command | Description |
|---------|-------------|
| `--list` | 📋 Show all available shows |
| `--status` | 📊 Show download progress |
| `--all` | 📥 Download everything |
| `--show <name>` | 🎯 Download specific show |
| `--output <path>` | 📁 Set output directory |
| `--dry-run` | 👀 Preview without downloading |
| `--limit <n>` | ⏱️ Limit episodes to download |

### Examples

```bash
# See what's available
node tv-downloader.js --list

# Download just South Park
node tv-downloader.js --show south-park --output ~/Movies

# Check your progress
node tv-downloader.js --status

# Preview what would download
node tv-downloader.js --all --dry-run
```

---

## 📁 Jellyfin-Ready Output

Files are automatically organized for Jellyfin:

```
TVShows/
├── 📂 South Park/
│   ├── 📂 Season 01/
│   │   ├── 🎬 South Park - S01E01 - Cartman dostava analni sondu.mp4
│   │   ├── 🎬 South Park - S01E02 - Posilovac 4000.mp4
│   │   └── ...
│   └── 📂 Season 02/
└── 📂 Simpsonovi/
    └── ...
```

Just point Jellyfin to your output folder and **boom** — instant library! 🎉

---

## 🛠️ Requirements

- **Node.js 18+**
- **~500MB** for Chromium browser
- **~300GB** disk space (for all shows)
- **Patience** ⏳

---

## ❓ Troubleshooting

<details>
<summary><strong>Browser not working?</strong></summary>

```bash
npx playwright install chromium
```
</details>

<details>
<summary><strong>Downloads failing?</strong></summary>

- Check if source site is up
- Try `--limit 1` to test one episode
- Videos may have been removed from source
</details>

<details>
<summary><strong>Want to re-download everything?</strong></summary>

```bash
node reset-all.js
```
</details>

---

## 🎨 How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  nahnoji.cz │────▶│  Playwright │────▶│    curl     │
│ prehrajto   │     │  (extract)  │     │ (download)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Jellyfin-  │
                    │  ready MP4s │
                    └─────────────┘
```

---

## 🕷️ Add More Shows (Crawler)

Want more shows? Use the included crawler:

```bash
# Crawl any nikee.net / alyss.cz / sifee.biz site
node crawlers/scan-nikee.js http://SHOWNAME.nikee.net

# Examples:
node crawlers/scan-nikee.js http://scrubs.nikee.net
node crawlers/scan-nikee.js http://mash.alyss.cz
node crawlers/scan-nikee.js http://chuck.sifee.biz
```

The crawler automatically:
- 🔍 Discovers all seasons and episodes
- 🔗 Extracts nahnoji.cz video IDs
- 📁 Creates a ready-to-use queue file in `shows/`
```

---

<p align="center">
  <img src="assets/chumper_hue_0.png" width="50" alt="Chumper">
</p>

<p align="center">
  Made with ❤️ for archiving Czech TV classics<br>
  <em><!-- Karel was here 🐸 --></em>
</p>
