/**
 * Nahnoji.cz South Park Episode Crawler
 * 
 * This script uses Playwright to navigate nahnoji.cz and find all
 * South Park episodes with their video IDs.
 * 
 * Usage: node crawl-nahnoji.js
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// South Park episode counts per season
const SOUTH_PARK_SEASONS = {
    1: 13, 2: 18, 3: 17, 4: 17, 5: 14, 6: 17, 7: 15, 8: 14,
    9: 14, 10: 14, 11: 14, 12: 14, 13: 14, 14: 14, 15: 14, 16: 14,
    17: 10, 18: 10, 19: 10, 20: 10, 21: 10, 22: 10, 23: 10, 24: 2,
    25: 6, 26: 6, 27: 5
};

async function crawlNahnoji() {
    console.log('🔍 Nahnoji.cz South Park Crawler');
    console.log('='.repeat(50));

    const browser = await chromium.launch({
        headless: false,  // Set to false to see what's happening
        slowMo: 100
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    const page = await context.newPage();
    const allEpisodes = new Map();

    try {
        console.log('\n📡 Navigating to nahnoji.cz...');
        await page.goto('http://nahnoji.cz/', { waitUntil: 'networkidle', timeout: 30000 });

        // Wait for page to load
        await page.waitForTimeout(2000);

        // Take a screenshot
        await page.screenshot({ path: 'nahnoji-home.png' });
        console.log('📸 Screenshot saved: nahnoji-home.png');

        // Find search input
        console.log('\n🔎 Looking for search functionality...');

        // Try to find search input
        const searchInput = await page.$('input[type="text"], input[type="search"], input[name*="search"], input[name*="hledej"]');

        if (searchInput) {
            console.log('   Found search input!');
            await searchInput.fill('south park');

            // Try to submit
            await searchInput.press('Enter');
            await page.waitForTimeout(3000);

            // Take screenshot of results
            await page.screenshot({ path: 'nahnoji-search.png' });
            console.log('📸 Screenshot saved: nahnoji-search.png');

            // Extract video links
            const videos = await extractVideos(page);
            console.log(`   Found ${videos.length} videos`);

            for (const v of videos) {
                allEpisodes.set(v.id, v);
            }

            // Try pagination
            let pageNum = 1;
            while (pageNum < 20) {  // Max 20 pages
                const nextButton = await page.$('a:has-text("další"), a:has-text("next"), a:has-text("»"), .next');
                if (!nextButton) break;

                pageNum++;
                console.log(`\n📄 Loading page ${pageNum}...`);
                await nextButton.click();
                await page.waitForTimeout(2000);

                const videos = await extractVideos(page);
                console.log(`   Found ${videos.length} videos`);

                for (const v of videos) {
                    allEpisodes.set(v.id, v);
                }
            }
        } else {
            console.log('   Search input not found, trying URL-based search...');

            // Try direct URL search
            await page.goto('http://nahnoji.cz/hledej?hledej=south+park', { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'nahnoji-search-direct.png' });

            const videos = await extractVideos(page);
            console.log(`   Found ${videos.length} videos`);

            for (const v of videos) {
                allEpisodes.set(v.id, v);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }

    // Convert to array and parse episodes
    const episodes = Array.from(allEpisodes.values());

    // Parse season/episode from titles
    const parsed = episodes.map(ep => {
        const match = ep.title.match(/(\d+)x(\d+)/i) ||
            ep.title.match(/s(\d+)e(\d+)/i) ||
            ep.title.match(/(\d+) x (\d+)/i);

        return {
            ...ep,
            season: match ? parseInt(match[1]) : 0,
            episode: match ? parseInt(match[2]) : 0
        };
    });

    // Sort by season and episode
    parsed.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
    });

    console.log(`\n✅ Found ${parsed.length} unique South Park episodes!`);

    // Save raw results
    const rawPath = path.join(__dirname, 'queue', 'south-park-raw.json');
    writeFileSync(rawPath, JSON.stringify(parsed, null, 2));
    console.log(`💾 Raw data saved to: ${rawPath}`);

    // Generate proper queue file
    if (parsed.length > 0) {
        generateQueue(parsed);
    }

    return parsed;
}

async function extractVideos(page) {
    return await page.evaluate(() => {
        const videos = [];

        // Find all links to videos
        document.querySelectorAll('a[href*="/video?id="], a[href*="video?id="]').forEach(link => {
            const href = link.getAttribute('href');
            const match = href.match(/id=(\d+)/);
            if (match) {
                videos.push({
                    id: match[1],
                    title: link.textContent.trim() || link.title || `Video ${match[1]}`,
                    url: href.startsWith('http') ? href : `http://nahnoji.cz${href}`
                });
            }
        });

        return videos;
    });
}

function generateQueue(episodes) {
    const queue = {
        showName: "South Park",
        showNameCz: "Městečko South Park",
        year: "1997-present",
        description: "Animated sitcom by Trey Parker and Matt Stone",
        targetFolder: "South_Park",
        source: "nahnoji.cz",
        seasons: [],
        stats: {
            totalEpisodes: 0,
            downloaded: 0,
            failed: 0,
            pending: 0
        }
    };

    // Group by season
    const bySeason = {};
    for (const ep of episodes) {
        if (ep.season > 0) {
            if (!bySeason[ep.season]) {
                bySeason[ep.season] = [];
            }
            bySeason[ep.season].push(ep);
        }
    }

    // Build seasons array
    for (const [seasonNum, seasonEps] of Object.entries(bySeason).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        const episodesList = seasonEps.map(ep => ({
            episode: ep.episode,
            title: ep.title.replace(/south park\s*-?\s*/i, '').replace(/\d+x\d+\s*-?\s*/i, '').trim(),
            url: ep.url,
            videoId: ep.id,
            status: "pending",
            filename: `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}.mp4`
        }));

        queue.seasons.push({
            season: parseInt(seasonNum),
            title: `Season ${seasonNum}`,
            expectedEpisodes: SOUTH_PARK_SEASONS[parseInt(seasonNum)] || 0,
            foundEpisodes: episodesList.length,
            episodes: episodesList
        });

        queue.stats.totalEpisodes += episodesList.length;
        queue.stats.pending += episodesList.length;
    }

    const queuePath = path.join(__dirname, 'queue', 'south-park.json');
    writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    console.log(`\n📁 Queue file saved to: ${queuePath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Seasons found: ${queue.seasons.length}`);
    console.log(`   Total episodes: ${queue.stats.totalEpisodes}`);
}

crawlNahnoji().catch(console.error);
