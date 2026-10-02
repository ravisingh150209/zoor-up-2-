import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function verifyLiveFirebaseUrl() {
  console.log('Testing live Firebase Hosting URL: https://zoor-up-9b3a3.web.app ...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    const response = await page.goto('https://zoor-up-9b3a3.web.app', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('HTTP Status:', response.status());

    const title = await page.title();
    console.log('Page Title:', title);

    const screenshotPath = path.join(screenshotsDir, 'live_firebase_deployment.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    const pageText = await page.innerText('body');
    console.log('Page Content Preview:\n', pageText.slice(0, 300));
  } catch (err) {
    console.error('Failed to load live Firebase URL:', err);
  } finally {
    await browser.close();
  }
}

verifyLiveFirebaseUrl();
