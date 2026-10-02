import { chromium } from '@playwright/test';

console.log('Testing Playwright Chromium launch...');

try {
  const browser = await chromium.launch({ headless: true });
  console.log('Chromium successfully launched!');
  const version = browser.version();
  console.log(`Chromium Version: ${version}`);
  
  const page = await browser.newPage();
  console.log('Navigating to http://localhost:5173/ ...');
  const response = await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  console.log(`HTTP Status: ${response.status()}`);
  const title = await page.title();
  console.log(`Page Title: ${title}`);
  
  await browser.close();
  console.log('Browser closed cleanly.');
  console.log('SUCCESS: Playwright is fully functional!');
} catch (err) {
  console.error('FAILED to launch or navigate:', err);
  process.exit(1);
}
