/**
 * TV Archiver - Prehrajto.cz Downloader Module
 * 
 * Downloads videos from prehrajto.cz with better quality detection
 * and proper handling of the video player.
 */

import { chromium } from 'playwright';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync, mkdirSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Downloads a video from prehrajto.cz
 * @param {string} pageUrl - The video page URL
 * @param {string} outputPath - Full path to save the video
 * @param {object} options - Download options
 * @returns {Promise<{success: boolean, size: number, error?: string}>}
 */
export async function downloadFromPrehrajto(pageUrl, outputPath, options = {}) {
    const {
        headless = true,
        timeout = 120000,
        quality = 'highest', // 'highest', 'lowest', or specific resolution
        onProgress = null,
        verbose = false
    } = options;

    const log = verbose ? console.log : () => { };

    log('🚀 Launching browser...');

    const browser = await chromium.launch({
        headless,
        args: ['--disable-blink-features=AutomationControlled']
    });

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });

        const page = await context.newPage();

        log(`📄 Navigating to: ${pageUrl}`);

        // Capture all video URLs from network
        const videoUrls = [];

        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('.mp4') && (url.includes('premiumcdn') || url.includes('cdn'))) {
                const contentLength = response.headers()['content-length'];
                videoUrls.push({
                    url,
                    size: contentLength ? parseInt(contentLength) : 0
                });
                log(`🎬 Found video URL (${contentLength ? Math.round(parseInt(contentLength) / 1024 / 1024) + 'MB' : 'unknown size'})`);
            }
        });

        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout });

        // Wait for page to settle
        await page.waitForTimeout(2000);

        // Try to click the play button
        log('▶️  Looking for play button...');

        const playButtonSelectors = [
            'button:has-text("Přehrát")',
            'button:has-text("Přehrát video")',
            'text=Přehrát video',
            '.play-button',
            '[data-action="play"]',
            '.vjs-big-play-button',
            'button[class*="play"]',
            '.player-play'
        ];

        for (const selector of playButtonSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    await button.click();
                    log(`   Clicked: ${selector}`);
                    break;
                }
            } catch (e) {
                // Try next selector
            }
        }

        // Wait for video to start loading
        log('⏳ Waiting for video to load...');
        await page.waitForTimeout(8000);

        // Also try to find video URL from page
        const pageVideoUrl = await page.evaluate(() => {
            // Check video elements
            const video = document.querySelector('video');
            if (video && video.src && video.src.includes('.mp4')) {
                return video.src;
            }

            const source = document.querySelector('video source[type="video/mp4"]');
            if (source && source.src) {
                return source.src;
            }

            // Check performance entries
            const entries = window.performance.getEntriesByType('resource');
            for (const entry of entries) {
                if (entry.name.includes('.mp4') && (entry.name.includes('premiumcdn') || entry.name.includes('cdn'))) {
                    return entry.name;
                }
            }

            return null;
        });

        if (pageVideoUrl && !videoUrls.find(v => v.url === pageVideoUrl)) {
            videoUrls.push({ url: pageVideoUrl, size: 0 });
        }

        if (videoUrls.length === 0) {
            throw new Error('Could not find video URL');
        }

        // Select the best quality (largest file)
        let selectedUrl;
        if (quality === 'highest') {
            // Sort by size descending and pick the first with known size, or just first
            const sorted = videoUrls.sort((a, b) => b.size - a.size);
            selectedUrl = sorted[0].url;
        } else if (quality === 'lowest') {
            const sorted = videoUrls.filter(v => v.size > 0).sort((a, b) => a.size - b.size);
            selectedUrl = sorted.length > 0 ? sorted[0].url : videoUrls[0].url;
        } else {
            selectedUrl = videoUrls[0].url;
        }

        log(`📥 Selected video URL`);
        log(`📁 Downloading to: ${outputPath}`);

        await browser.close();

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        // Download using curl with progress
        return await downloadWithCurl(selectedUrl, outputPath, pageUrl, onProgress);

    } catch (error) {
        await browser.close();
        return {
            success: false,
            size: 0,
            error: error.message
        };
    }
}

/**
 * Download file using curl with progress tracking
 */
async function downloadWithCurl(url, outputPath, referer, onProgress) {
    return new Promise((resolve) => {
        const args = [
            '-L',
            '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            '-H', `Referer: ${referer}`,
            '-o', outputPath,
            '--progress-bar',
            url
        ];

        const curl = spawn('curl', args, { stdio: ['inherit', 'inherit', 'inherit'] });

        curl.on('close', (code) => {
            if (code === 0 && existsSync(outputPath)) {
                const stats = statSync(outputPath);
                resolve({
                    success: true,
                    size: stats.size,
                    sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
                });
            } else {
                resolve({
                    success: false,
                    size: 0,
                    error: `curl exited with code ${code}`
                });
            }
        });

        curl.on('error', (err) => {
            resolve({
                success: false,
                size: 0,
                error: err.message
            });
        });
    });
}

export default { downloadFromPrehrajto };
