#!/usr/bin/env node
/**
 * Reset all episode statuses to "pending" for fresh downloads
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOWS_DIR = path.join(__dirname, 'shows');

console.log('🔄 Resetting all episodes to pending...\n');

let totalReset = 0;

for (const file of readdirSync(SHOWS_DIR).filter(f => f.endsWith('.json'))) {
    const filepath = path.join(SHOWS_DIR, file);
    const show = JSON.parse(readFileSync(filepath, 'utf-8'));
    let showReset = 0;

    for (const season of show.seasons || []) {
        for (const ep of season.episodes || []) {
            if (ep.status === 'downloaded' || ep.status === 'failed') {
                ep.status = 'pending';
                delete ep.downloadedAt;
                delete ep.fileSize;
                delete ep.error;
                showReset++;
            }
        }
    }

    if (show.stats) {
        show.stats.downloaded = 0;
        show.stats.failed = 0;
        show.stats.pending = show.stats.totalEpisodes || 0;
    }

    writeFileSync(filepath, JSON.stringify(show, null, 2));
    console.log(`   ${show.showName}: ${showReset} episodes reset`);
    totalReset += showReset;
}

console.log(`\n✅ Done! Reset ${totalReset} episodes to pending.`);
console.log('\n📺 Now run: node tv-downloader.js --all --output /path/to/jellyfin');
