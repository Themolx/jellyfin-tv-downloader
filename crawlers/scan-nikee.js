/**
 * TV Show Scraper for nikee.net, alyss.cz, sifee.biz
 * 
 * Crawls TV show sites and extracts all episodes with their
 * nahnoji.cz video IDs, generating a queue file for the downloader.
 * 
 * Usage: node scan-nikee.js <base-url> [<base-url2> ...]
 * Example: node scan-nikee.js http://griffinovi.nikee.net http://bean.sifee.biz
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rate limiting delay (ms between requests)
const REQUEST_DELAY = 200;

/**
 * Fetch a URL with basic error handling
 */
async function fetchPage(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.text();
}

/**
 * Delay helper for rate limiting
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract show name from the base URL
 * Works with: nikee.net, alyss.cz, sifee.biz
 */
function extractShowName(baseUrl) {
    // Match subdomain from various domains
    const match = baseUrl.match(/https?:\/\/([^.]+)\.(nikee\.net|alyss\.cz|sifee\.biz|enkii\.cz)/);
    return match ? match[1] : 'unknown-show';
}

/**
 * Discover all available seasons from the episodes page
 * Returns empty array if no seasons found (single-season show)
 */
async function discoverSeasons(baseUrl) {
    console.log('\n📡 Discovering seasons...');

    const html = await fetchPage(`${baseUrl}/index.php?stranka=epizody`);

    // Find all season links: index.php?stranka=serie&cislo=N
    const seasonRegex = /stranka=serie&(?:amp;)?cislo=(\d+)/g;
    const seasons = new Set();

    let match;
    while ((match = seasonRegex.exec(html)) !== null) {
        seasons.add(parseInt(match[1]));
    }

    const sortedSeasons = Array.from(seasons).sort((a, b) => a - b);

    if (sortedSeasons.length > 0) {
        console.log(`   Found ${sortedSeasons.length} seasons: ${sortedSeasons.join(', ')}`);
    } else {
        console.log(`   No seasons found - treating as single-season show`);
    }

    return sortedSeasons;
}

/**
 * Extract episodes from a page (season page or episodes page)
 */
async function extractEpisodesFromPage(html, defaultSeason = 1) {
    const episodes = [];

    // Look for links to episodes - capture everything between opening and closing a tags
    // Including any nested HTML tags like <B>
    const linkRegex = /<a[^>]*href=["']?index\.php\?video=(\d+)["']?[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const videoNum = parseInt(match[1]);
        // Strip HTML tags from the content
        const linkText = match[2].replace(/<[^>]+>/g, '').trim();

        if (!linkText) continue;

        // Try to parse season/episode from link text (e.g., "01x03 - Title" or "1x3 Title")
        const epMatch = linkText.match(/(\d+)\s*x\s*(\d+)\s*[-–]?\s*(.*)/i);

        if (epMatch) {
            episodes.push({
                videoNum,
                season: parseInt(epMatch[1]),
                episode: parseInt(epMatch[2]),
                title: epMatch[3].trim() || linkText
            });
        } else {
            // No episode pattern found, use default season and order
            episodes.push({
                videoNum,
                season: defaultSeason,
                episode: 0, // Will be assigned later
                title: linkText
            });
        }
    }

    // Deduplicate by videoNum
    const seen = new Set();
    const uniqueEpisodes = episodes.filter(ep => {
        if (seen.has(ep.videoNum)) return false;
        seen.add(ep.videoNum);
        return true;
    });

    // Sort by episode number, then by videoNum
    uniqueEpisodes.sort((a, b) => a.episode - b.episode || a.videoNum - b.videoNum);

    // Assign episode numbers for any that don't have them
    let autoEpNum = 1;
    for (const ep of uniqueEpisodes) {
        if (ep.episode === 0) {
            ep.episode = autoEpNum;
        }
        autoEpNum = ep.episode + 1;
    }

    return uniqueEpisodes;
}

/**
 * Extract episodes from a season page
 */
async function extractSeasonEpisodes(baseUrl, seasonNum) {
    const html = await fetchPage(`${baseUrl}/index.php?stranka=serie&cislo=${seasonNum}`);
    return extractEpisodesFromPage(html, seasonNum);
}

/**
 * Extract episodes directly from episodes page (for shows without season structure)
 */
async function extractAllEpisodesFromMainPage(baseUrl) {
    const html = await fetchPage(`${baseUrl}/index.php?stranka=epizody`);
    return extractEpisodesFromPage(html, 1);
}

/**
 * Extract nahnoji embed ID from an episode page
 */
async function extractNahnojiId(baseUrl, videoNum) {
    const html = await fetchPage(`${baseUrl}/index.php?video=${videoNum}`);

    // Look for nahnoji iframe: src="http://nahnoji.cz/embed?id=XXXXX"
    const iframeMatch = html.match(/nahnoji\.cz\/embed\?id=(\d+)/);

    if (iframeMatch) {
        return iframeMatch[1];
    }

    return null;
}

/**
 * Main scanning function
 */
async function scanShow(baseUrl) {
    console.log('🔍 TV Show Scraper (nikee.net / alyss.cz / sifee.biz)');
    console.log('='.repeat(55));
    console.log(`📺 Scanning: ${baseUrl}`);

    const showName = extractShowName(baseUrl);
    console.log(`📝 Show name: ${showName}`);

    // Discover seasons
    const seasons = await discoverSeasons(baseUrl);

    const allEpisodes = [];

    if (seasons.length === 0) {
        // No seasons - extract directly from episodes page
        console.log('\n📁 Extracting episodes from main page...');
        const episodes = await extractAllEpisodesFromMainPage(baseUrl);
        console.log(`   Found ${episodes.length} episodes`);

        // Get nahnoji IDs for each episode
        for (const ep of episodes) {
            await delay(REQUEST_DELAY);
            const epLabel = `${ep.season}x${String(ep.episode).padStart(2, '0')}`;
            const titlePreview = ep.title.substring(0, 35).padEnd(35, ' ');
            process.stdout.write(`   🎬 ${epLabel} - ${titlePreview}`);

            const nahnojiId = await extractNahnojiId(baseUrl, ep.videoNum);

            if (nahnojiId) {
                ep.nahnojiId = nahnojiId;
                console.log(` ✅ ${nahnojiId}`);
            } else {
                console.log(' ❌');
            }

            allEpisodes.push(ep);
        }
    } else {
        // Extract episodes from each season
        for (const seasonNum of seasons) {
            console.log(`\n📁 Season ${seasonNum}:`);
            await delay(REQUEST_DELAY);

            const episodes = await extractSeasonEpisodes(baseUrl, seasonNum);
            console.log(`   Found ${episodes.length} episodes`);

            // Get nahnoji IDs for each episode
            for (const ep of episodes) {
                await delay(REQUEST_DELAY);
                const epLabel = `${ep.season}x${String(ep.episode).padStart(2, '0')}`;
                const titlePreview = ep.title.substring(0, 35).padEnd(35, ' ');
                process.stdout.write(`   🎬 ${epLabel} - ${titlePreview}`);

                const nahnojiId = await extractNahnojiId(baseUrl, ep.videoNum);

                if (nahnojiId) {
                    ep.nahnojiId = nahnojiId;
                    console.log(` ✅ ${nahnojiId}`);
                } else {
                    console.log(' ❌');
                }

                allEpisodes.push(ep);
            }
        }
    }

    console.log(`\n✅ Found ${allEpisodes.length} total episodes`);

    // Filter episodes with nahnoji IDs
    const validEpisodes = allEpisodes.filter(ep => ep.nahnojiId);
    console.log(`   ${validEpisodes.length} have nahnoji video IDs`);

    return {
        showName,
        baseUrl,
        episodes: validEpisodes
    };
}

/**
 * Generate queue JSON file in the standard format
 */
function generateQueueFile(showData) {
    const { showName, baseUrl, episodes } = showData;

    // Group episodes by season
    const bySeason = {};
    for (const ep of episodes) {
        if (!bySeason[ep.season]) {
            bySeason[ep.season] = [];
        }
        bySeason[ep.season].push(ep);
    }

    // Build queue structure
    const queue = {
        showName: showName.charAt(0).toUpperCase() + showName.slice(1),
        showNameCz: showName.charAt(0).toUpperCase() + showName.slice(1),
        year: "",
        description: `Scraped from ${baseUrl}`,
        targetFolder: showName.replace(/-/g, '_'),
        source: "nahnoji.cz",
        originalSource: baseUrl,
        seasons: [],
        stats: {
            totalEpisodes: 0,
            downloaded: 0,
            failed: 0,
            pending: 0
        }
    };

    // Build seasons array
    for (const [seasonNum, seasonEps] of Object.entries(bySeason).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        const episodesList = seasonEps.map(ep => ({
            episode: ep.episode,
            title: ep.title,
            url: `http://nahnoji.cz/video?id=${ep.nahnojiId}`,
            videoId: ep.nahnojiId,
            originalUrl: `${baseUrl}/index.php?video=${ep.videoNum}`,
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

    // Ensure shows directory exists (in parent directory)
    const showsDir = path.join(__dirname, '..', 'shows');
    if (!existsSync(showsDir)) {
        mkdirSync(showsDir, { recursive: true });
    }

    // Save queue file
    const queuePath = path.join(showsDir, `${showName}.json`);
    writeFileSync(queuePath, JSON.stringify(queue, null, 2));

    console.log(`\n📁 Queue file saved: ${queuePath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Seasons: ${queue.seasons.length}`);
    console.log(`   Total episodes: ${queue.stats.totalEpisodes}`);

    return queuePath;
}

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node scan-nikee.js <base-url> [<base-url2> ...]');
        console.log('Example: node scan-nikee.js http://griffinovi.nikee.net');
        console.log('\nSupported domains:');
        console.log('  - *.nikee.net (griffinovi, south-park, futurama, simpsonovi, bigbangtheory, reddwarf)');
        console.log('  - *.alyss.cz (malysheldon, jmenujiseearl, himym, ajtaci, mash)');
        console.log('  - *.sifee.biz (bean, brickleberry, dvaapulchlapa, rickamorty, hospoda)');
        process.exit(1);
    }

    // Process each URL
    for (const rawUrl of args) {
        let baseUrl = rawUrl;

        // Normalize URL
        if (!baseUrl.startsWith('http')) {
            baseUrl = `http://${baseUrl}`;
        }
        baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

        try {
            const showData = await scanShow(baseUrl);

            if (showData && showData.episodes.length > 0) {
                generateQueueFile(showData);
            } else {
                console.log('\n❌ No episodes with nahnoji IDs found.');
            }
        } catch (error) {
            console.error(`\n❌ Error scanning ${baseUrl}: ${error.message}`);
        }

        console.log('\n' + '─'.repeat(55) + '\n');
    }
}

main().catch(console.error);
