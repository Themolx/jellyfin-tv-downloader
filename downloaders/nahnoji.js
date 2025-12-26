/**
 * Nahnoji.cz Downloader Module
 * 
 * Downloads videos from nahnoji.cz using Playwright to extract video URLs.
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';

export async function downloadFromNahnoji(videoUrl, outputPath, options = {}) {
    const { headless = true, timeout = 60000 } = options;

    console.log(`  Downloading from: ${videoUrl}`);

    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    const page = await context.newPage();
    let videoSrc = null;

    try {
        // Monitor network for video URLs
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('.mp4') && !url.includes('thumbnail')) {
                videoSrc = url;
            }
        });

        await page.goto(videoUrl, { waitUntil: 'networkidle', timeout });
        await page.waitForTimeout(2000);

        // Try to find video element
        if (!videoSrc) {
            videoSrc = await page.evaluate(() => {
                const video = document.querySelector('video');
                if (video) return video.src || video.querySelector('source')?.src;
                return null;
            });
        }

        if (!videoSrc) {
            throw new Error('Could not find video URL');
        }

        console.log(`  Video URL found: ${videoSrc.substring(0, 80)}...`);

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        // Close browser before downloading (free resources)
        await browser.close();

        // Download with curl using spawn (non-blocking)
        console.log(`  Downloading to: ${outputPath}`);

        const result = await new Promise((resolve, reject) => {
            const curl = spawn('curl', [
                '-L', '-s', '-o', outputPath,
                '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                '-H', `Referer: ${videoUrl}`,
                videoSrc
            ]);

            curl.on('close', (code) => {
                if (code === 0) {
                    const size = existsSync(outputPath) ? statSync(outputPath).size : 0;
                    resolve({ success: true, url: videoSrc, size });
                } else {
                    reject(new Error(`curl exited with code ${code}`));
                }
            });

            curl.on('error', reject);
        });

        return result;

    } catch (error) {
        console.error(`  Error: ${error.message}`);
        await browser.close().catch(() => { });
        return { success: false, error: error.message };
    }
}
