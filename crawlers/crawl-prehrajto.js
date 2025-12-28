#!/usr/bin/env node
/**
 * Prehrajto.cz Crawler
 * 
 * Sophisticated crawler for searching and scraping video metadata from prehrajto.cz
 * Works for both TV shows and movies.
 * 
 * Features:
 * - Search by query string
 * - Extract file sizes, HD/SD quality, duration
 * - Multiple search result handling
 * - TV show episode crawling from nikee/alyss/sifee sites
 * - Direct movie/video search
 * 
 * Usage:
 *   # Search for a specific video
 *   node crawl-prehrajto.js search "jmenuju se earl 1x01"
 * 
 *   # Crawl a TV show from nikee-style site
 *   node crawl-prehrajto.js crawl http://jmenujiseearl.alyss.cz --search-term "jmenuju se earl"
 * 
 *   # Search for a movie
 *   node crawl-prehrajto.js search "Forrest Gump 1994 CZ"
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

const PREHRAJTO_BASE = 'https://prehrajto.cz';
const REQUEST_DELAY = 800;  // ms between requests to avoid rate limiting

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ANSI colors
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    magenta: '\x1b[35m'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg, color = '') {
    console.log(`${color}${msg}${c.reset}`);
}

async function fetchPage(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.text();
}

function formatSize(sizeMB) {
    if (sizeMB >= 1024) {
        return `${(sizeMB / 1024).toFixed(2)} GB`;
    }
    return `${sizeMB.toFixed(1)} MB`;
}

// ============================================================================
// PREHRAJTO SEARCH & SCRAPING
// ============================================================================

/**
 * @typedef {Object} PrehrajtoResult
 * @property {string} url - Full URL to the video page
 * @property {string} slug - URL slug/path
 * @property {string} id - Video ID
 * @property {string} title - Video title (from URL)
 * @property {boolean} isHD - Whether it's HD quality
 * @property {number} sizeMB - File size in MB
 * @property {string} duration - Video duration (if available)
 */

/**
 * Search prehrajto.cz for videos matching a query
 * @param {string} query - Search query
 * @returns {Promise<PrehrajtoResult[]>} - Array of search results
 */
export async function searchPrehrajto(query) {
    const searchUrl = `${PREHRAJTO_BASE}/hledej/${encodeURIComponent(query)}`;

    const html = await fetchPage(searchUrl);
    const results = [];

    // Find all video links: href="/video-slug/hexid"
    // The pattern captures the full path
    const linkRegex = /href="(\/([a-z0-9-]+)\/([a-f0-9]{10,}))"/g;

    let match;
    const seenIds = new Set();

    while ((match = linkRegex.exec(html)) !== null) {
        const [, fullPath, slug, id] = match;

        // Skip duplicate IDs
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        // Look for metadata AFTER the link (in video__tag divs)
        // The HTML has ~20 thumbnails per video so we need a large context window
        const afterLink = html.substring(match.index, Math.min(html.length, match.index + 6000));

        // Check for HD marker: <span class="format__text">HD</span>
        const isHD = afterLink.includes('format__text">HD<') ||
            afterLink.includes('>HD<') ||
            slug.includes('1080') ||
            slug.includes('720p');

        // Extract file size from video__tag--size
        // The size is on the next line after the class, so we need multi-line matching
        let sizeMB = 0;
        const sizeMatch = afterLink.match(/video__tag--size[^>]*>[\s\S]*?([\d.]+)\s*(MB|GB)/i);
        if (sizeMatch) {
            sizeMB = parseFloat(sizeMatch[1]);
            if (sizeMatch[2].toUpperCase() === 'GB') {
                sizeMB *= 1024;
            }
        }

        // Extract duration from video__tag--time
        let duration = '';
        const durationMatch = afterLink.match(/video__tag--time[^>]*>([\d:]+)</);
        if (durationMatch) {
            duration = durationMatch[1];
        }

        // Get title from title attribute if available
        const titleMatch = afterLink.match(/title="([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        results.push({
            url: `${PREHRAJTO_BASE}${fullPath}`,
            slug,
            id,
            title,
            isHD,
            sizeMB,
            sizeFormatted: formatSize(sizeMB),
            duration
        });
    }

    return results;
}

/**
 * Search and pick the best result based on quality preferences
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @param {string} options.quality - 'highest', 'lowest', 'hd-only', 'sd-only'
 * @param {number} options.maxSizeMB - Maximum file size in MB (0 = no limit)
 * @returns {Promise<PrehrajtoResult|null>}
 */
export async function searchBest(query, options = {}) {
    const { quality = 'highest', maxSizeMB = 0 } = options;

    const results = await searchPrehrajto(query);

    if (results.length === 0) {
        return null;
    }

    // Filter out 0 MB results (broken/unknown size)
    let filtered = results.filter(r => r.sizeMB > 0);

    // If all results are 0 MB, fall back to all results
    if (filtered.length === 0) {
        filtered = results;
    }

    // Filter by max size if specified
    if (maxSizeMB > 0) {
        const sizeFiltered = filtered.filter(r => r.sizeMB > 0 && r.sizeMB <= maxSizeMB);
        if (sizeFiltered.length > 0) {
            filtered = sizeFiltered;
        }
        // If no results under maxSize, we'll pick the smallest available
    }

    // Filter by quality preference
    if (quality === 'hd-only') {
        const hdFiltered = filtered.filter(r => r.isHD);
        if (hdFiltered.length > 0) filtered = hdFiltered;
    } else if (quality === 'sd-only') {
        const sdFiltered = filtered.filter(r => !r.isHD);
        if (sdFiltered.length > 0) filtered = sdFiltered;
    }

    // Sort by preference
    if (quality === 'lowest' || maxSizeMB > 0) {
        // When max size is set or lowest quality, prefer smaller files
        filtered.sort((a, b) => {
            // Files with known size first
            if (a.sizeMB > 0 && b.sizeMB === 0) return -1;
            if (a.sizeMB === 0 && b.sizeMB > 0) return 1;
            // Then by size (smaller first)
            return a.sizeMB - b.sizeMB;
        });
    } else {
        // Default: highest quality (larger files)
        filtered.sort((a, b) => {
            // Prefer HD
            if (a.isHD && !b.isHD) return -1;
            if (!a.isHD && b.isHD) return 1;
            // Then by size (larger = better quality usually)
            return b.sizeMB - a.sizeMB;
        });
    }

    return filtered[0];
}

// ============================================================================
// NIKEE/ALYSS/SIFEE EPISODE SCRAPING
// ============================================================================

function extractShowName(baseUrl) {
    const match = baseUrl.match(/https?:\/\/([^.]+)\.(nikee\.net|alyss\.cz|sifee\.biz|enkii\.cz)/);
    return match ? match[1] : 'unknown-show';
}

async function discoverSeasons(baseUrl) {
    const html = await fetchPage(`${baseUrl}/index.php?stranka=epizody`);
    const seasonRegex = /stranka=serie&(?:amp;)?cislo=(\d+)/g;
    const seasons = new Set();

    let match;
    while ((match = seasonRegex.exec(html)) !== null) {
        seasons.add(parseInt(match[1]));
    }

    return Array.from(seasons).sort((a, b) => a - b);
}

async function extractSeasonEpisodes(baseUrl, seasonNum) {
    const html = await fetchPage(`${baseUrl}/index.php?stranka=serie&cislo=${seasonNum}`);
    const episodes = [];

    const linkRegex = /<a[^>]*href=["']?index\.php\?video=(\d+)["']?[^>]*>([\s\S]*?)<\/a>/gi;

    let epNum = 1;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const videoNum = parseInt(match[1]);
        const title = match[2].replace(/<[^>]+>/g, '').trim();

        if (!title || title === '©' || title.length < 2) continue;

        episodes.push({
            season: seasonNum,
            episode: epNum++,
            title,
            videoNum
        });
    }

    return episodes;
}

// ============================================================================
// TV SHOW CRAWL COMMAND
// ============================================================================

async function crawlTVShow(baseUrl, searchTerm, options = {}) {
    const { quality = 'highest', maxSizeMB = 0 } = options;

    log('🔍 Prehrajto TV Show Crawler', c.bold + c.cyan);
    log('═'.repeat(60), c.cyan);
    log(`📺 Source: ${baseUrl}`, c.gray);
    log(`🔎 Search: "${searchTerm}"`, c.gray);
    log(`🎯 Quality: ${quality}${maxSizeMB > 0 ? `, max ${maxSizeMB}MB` : ''}`, c.gray);
    log('');

    const showName = extractShowName(baseUrl);

    // Discover seasons
    log('📡 Discovering seasons...', c.cyan);
    const seasons = await discoverSeasons(baseUrl);

    if (seasons.length === 0) {
        log('   No seasons found, treating as single-season show', c.yellow);
        seasons.push(1);
    } else {
        log(`   Found ${seasons.length} seasons: ${seasons.join(', ')}`, c.green);
    }

    const allEpisodes = [];
    let foundCount = 0;
    let hdCount = 0;

    for (const seasonNum of seasons) {
        log(`\n📁 Season ${seasonNum}`, c.bold);
        await delay(REQUEST_DELAY);

        const episodes = await extractSeasonEpisodes(baseUrl, seasonNum);
        log(`   Found ${episodes.length} episodes`, c.gray);

        for (const ep of episodes) {
            await delay(REQUEST_DELAY);

            const epLabel = `${seasonNum}x${String(ep.episode).padStart(2, '0')}`;
            const query = `${searchTerm} ${epLabel}`;

            process.stdout.write(`   🔍 ${epLabel} - ${ep.title.substring(0, 28).padEnd(28)} `);

            try {
                const result = await searchBest(query, { quality, maxSizeMB });

                if (result) {
                    ep.prehrajtoUrl = result.url;
                    ep.prehrajtoId = result.id;
                    ep.isHD = result.isHD;
                    ep.sizeMB = result.sizeMB;
                    ep.sizeFormatted = result.sizeFormatted;
                    ep.duration = result.duration;

                    foundCount++;
                    if (result.isHD) hdCount++;

                    log(`✅ ${result.isHD ? 'HD' : 'SD'} ${result.sizeFormatted}`, c.green);
                } else {
                    log('❌ Not found', c.red);
                }
            } catch (err) {
                log(`❌ Error: ${err.message}`, c.red);
            }

            allEpisodes.push(ep);
        }
    }

    // Summary
    log('\n' + '═'.repeat(60), c.cyan);
    log(`📊 Results: ${foundCount}/${allEpisodes.length} episodes found`, c.bold);
    log(`   ${hdCount} in HD, ${foundCount - hdCount} in SD`, c.gray);

    return {
        showName,
        searchTerm,
        baseUrl,
        quality,
        episodes: allEpisodes,
        stats: {
            total: allEpisodes.length,
            found: foundCount,
            hdCount,
            sdCount: foundCount - hdCount
        }
    };
}

// ============================================================================
// GENERATE QUEUE FILE
// ============================================================================

function generateQueueFile(showData, outputPath = null) {
    const { showName, searchTerm, baseUrl, episodes } = showData;

    // Group episodes by season
    const bySeason = {};
    for (const ep of episodes) {
        if (!bySeason[ep.season]) {
            bySeason[ep.season] = [];
        }
        bySeason[ep.season].push(ep);
    }

    // Format show name nicely
    const formattedName = searchTerm
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    const queue = {
        showName: formattedName,
        showNameCz: formattedName,
        year: "",
        description: `Scraped from ${baseUrl}, videos from prehrajto.cz`,
        targetFolder: showName.replace(/-/g, '_'),
        source: "prehrajto.cz",
        originalSource: baseUrl,
        seasons: [],
        stats: {
            totalEpisodes: 0,
            downloaded: 0,
            failed: 0,
            pending: 0
        }
    };

    for (const [seasonNum, seasonEps] of Object.entries(bySeason).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        const episodesList = seasonEps
            .filter(ep => ep.prehrajtoUrl)
            .map(ep => ({
                episode: ep.episode,
                title: ep.title,
                url: ep.prehrajtoUrl,
                videoId: ep.prehrajtoId,
                originalUrl: `${baseUrl}/index.php?video=${ep.videoNum}`,
                isHD: ep.isHD || false,
                sizeMB: ep.sizeMB || 0,
                sizeFormatted: ep.sizeFormatted || '',
                duration: ep.duration || '',
                status: "pending",
                filename: `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}.mp4`
            }));

        queue.seasons.push({
            season: parseInt(seasonNum),
            title: `Season ${seasonNum}`,
            episodes: episodesList
        });

        queue.stats.totalEpisodes += episodesList.length;
        queue.stats.pending += episodesList.length;
    }

    // Determine output path
    const showsDir = path.join(__dirname, '..', 'shows');
    if (!existsSync(showsDir)) {
        mkdirSync(showsDir, { recursive: true });
    }

    const queuePath = outputPath || path.join(showsDir, `${showName}.json`);
    writeFileSync(queuePath, JSON.stringify(queue, null, 2));

    log(`\n📁 Queue saved: ${queuePath}`, c.green);

    return queuePath;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        console.log(`
${c.bold}${c.cyan}🎬 Prehrajto.cz Crawler${c.reset}

Search and scrape video metadata from prehrajto.cz

${c.bold}Commands:${c.reset}

  ${c.cyan}search${c.reset} <query>
    Search for videos and display results.
    Example: node crawl-prehrajto.js search "jmenuju se earl 1x01"
    
  ${c.cyan}crawl${c.reset} <base-url> --search-term "name" [--quality highest|lowest|hd-only]
    Crawl a TV show from nikee/alyss/sifee site and find episodes on prehrajto.
    Example: node crawl-prehrajto.js crawl http://jmenujiseearl.alyss.cz --search-term "jmenuju se earl"

${c.bold}Options:${c.reset}
  --search-term "name"   Search term for prehrajto (required for crawl)
  --quality <pref>       Quality preference: highest (default), lowest, hd-only, sd-only
  --max-size <MB>        Maximum file size in MB (e.g., 400 for ~400MB limit)
  --output <path>        Output path for JSON queue file

${c.bold}Examples:${c.reset}
  ${c.gray}# Search for a movie${c.reset}
  node crawl-prehrajto.js search "Forrest Gump 1994 CZ dabing"
  
  ${c.gray}# Crawl TV show${c.reset}
  node crawl-prehrajto.js crawl http://jmenujiseearl.alyss.cz --search-term "jmenuju se earl"
  
  ${c.gray}# Crawl with max 400MB per episode${c.reset}
  node crawl-prehrajto.js crawl http://jmenujiseearl.alyss.cz --search-term "jmenuju se earl" --max-size 400
`);
        return;
    }

    // Parse common options
    const getArg = (name) => {
        const idx = args.indexOf(name);
        return idx !== -1 ? args[idx + 1] : null;
    };

    const quality = getArg('--quality') || 'highest';
    const maxSizeMB = parseInt(getArg('--max-size')) || 0;
    const outputPath = getArg('--output');

    try {
        if (command === 'search') {
            const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');

            if (!query) {
                log('❌ Please provide a search query', c.red);
                process.exit(1);
            }

            log(`🔍 Searching: "${query}"`, c.cyan);
            log('');

            const results = await searchPrehrajto(query);

            if (results.length === 0) {
                log('No results found.', c.yellow);
                return;
            }

            log(`Found ${results.length} results:\n`, c.green);

            for (const r of results) {
                const hdBadge = r.isHD ? `${c.green}HD${c.reset}` : `${c.gray}SD${c.reset}`;
                log(`  ${hdBadge} ${r.sizeFormatted.padStart(10)} │ ${r.duration.padStart(8)} │ ${r.title.substring(0, 50)}`);
                log(`     ${c.gray}${r.url}${c.reset}`);
            }

        } else if (command === 'crawl') {
            const baseUrl = args[1];
            let searchTerm = getArg('--search-term');

            if (!baseUrl) {
                log('❌ Please provide a base URL', c.red);
                process.exit(1);
            }

            // Default search term from URL
            if (!searchTerm) {
                searchTerm = extractShowName(baseUrl).replace(/-/g, ' ');
            }

            const showData = await crawlTVShow(baseUrl, searchTerm, { quality, maxSizeMB });

            if (showData.stats.found > 0) {
                generateQueueFile(showData, outputPath);
            } else {
                log('\n❌ No episodes found on Prehrajto', c.red);
            }

        } else {
            log(`❌ Unknown command: ${command}`, c.red);
            log('Use --help to see available commands', c.gray);
            process.exit(1);
        }

    } catch (error) {
        log(`\n❌ Error: ${error.message}`, c.red);
        process.exit(1);
    }
}

// Run CLI if executed directly
main().catch(console.error);
