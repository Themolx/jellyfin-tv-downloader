/**
 * Nahnoji.cz Video ID Scanner
 * 
 * Since the search doesn't work, we scan video IDs directly
 * to find South Park episodes.
 * 
 * Usage: node scan-nahnoji.js [startId] [endId]
 * Example: node scan-nahnoji.js 12700 12800
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default range - adjust based on known IDs
const DEFAULT_START = 12700;  // We know 12779 is South Park
const DEFAULT_END = 13000;

async function scanVideoId(context, videoId) {
    const page = await context.newPage();
    let result = null;

    try {
        const url = `http://nahnoji.cz/video?id=${videoId}`;
        const response = await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });

        if (response && response.ok()) {
            // Get title from page
            const title = await page.evaluate(() => {
                const h1 = document.querySelector('h1');
                return h1 ? h1.textContent.trim() : null;
            });

            if (title && title.toLowerCase().includes('south park')) {
                result = {
                    id: String(videoId),
                    title: title,
                    url: url
                };
            }
        }
    } catch (error) {
        // Ignore errors - video might not exist
    } finally {
        await page.close();
    }

    return result;
}

async function scanRange(startId, endId) {
    console.log('🔍 Nahnoji.cz Video ID Scanner');
    console.log('='.repeat(50));
    console.log(`📊 Scanning IDs from ${startId} to ${endId}`);
    console.log(`   Total IDs to scan: ${endId - startId + 1}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    const episodes = [];
    let scanned = 0;
    const total = endId - startId + 1;

    try {
        // Scan in batches
        const BATCH_SIZE = 10;

        for (let batchStart = startId; batchStart <= endId; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endId);
            const promises = [];

            for (let id = batchStart; id <= batchEnd; id++) {
                promises.push(scanVideoId(context, id));
            }

            const results = await Promise.all(promises);

            for (const result of results) {
                if (result) {
                    episodes.push(result);
                    console.log(`   ✅ Found: ${result.id} - ${result.title}`);
                }
            }

            scanned += (batchEnd - batchStart + 1);
            const progress = Math.round((scanned / total) * 100);
            process.stdout.write(`\r   Progress: ${progress}% (${scanned}/${total}) - Found: ${episodes.length}`);
        }

    } finally {
        await browser.close();
    }

    console.log(`\n\n✅ Scan complete! Found ${episodes.length} South Park episodes.`);

    // Parse season/episode from titles
    const parsed = episodes.map(ep => {
        const match = ep.title.match(/(\d+)x(\d+)/i) ||
            ep.title.match(/s(\d+)e(\d+)/i);

        return {
            ...ep,
            season: match ? parseInt(match[1]) : 0,
            episode: match ? parseInt(match[2]) : 0
        };
    });

    // Sort
    parsed.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
    });

    // Save results
    const resultPath = path.join(__dirname, 'queue', 'south-park-scan.json');
    writeFileSync(resultPath, JSON.stringify(parsed, null, 2));
    console.log(`💾 Results saved to: ${resultPath}`);

    // Generate queue
    if (parsed.length > 0) {
        generateQueue(parsed);
    }

    return parsed;
}

function generateQueue(episodes) {
    const SOUTH_PARK_SEASONS = {
        1: 13, 2: 18, 3: 17, 4: 17, 5: 14, 6: 17, 7: 15, 8: 14,
        9: 14, 10: 14, 11: 14, 12: 14, 13: 14, 14: 14, 15: 14, 16: 14,
        17: 10, 18: 10, 19: 10, 20: 10, 21: 10, 22: 10, 23: 10, 24: 2,
        25: 6, 26: 6, 27: 5
    };

    const queue = {
        showName: "South Park",
        showNameCz: "Městečko South Park",
        year: "1997-present",
        description: "Animated sitcom by Trey Parker and Matt Stone",
        targetFolder: "South_Park",
        source: "nahnoji.cz",
        seasons: [],
        stats: { totalEpisodes: 0, downloaded: 0, failed: 0, pending: 0 }
    };

    // Group by season
    const bySeason = {};
    for (const ep of episodes) {
        if (ep.season > 0) {
            if (!bySeason[ep.season]) bySeason[ep.season] = [];
            bySeason[ep.season].push(ep);
        }
    }

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
    console.log(`📁 Queue file saved to: ${queuePath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Seasons found: ${queue.seasons.length}`);
    console.log(`   Total episodes: ${queue.stats.totalEpisodes}`);
}

// Main
const args = process.argv.slice(2);
const startId = parseInt(args[0]) || DEFAULT_START;
const endId = parseInt(args[1]) || DEFAULT_END;

scanRange(startId, endId).catch(console.error);
