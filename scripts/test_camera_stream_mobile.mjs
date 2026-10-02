import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');

async function testWithMobileCameraStream() {
  console.log('Testing with Chromium virtual camera stream on Mobile viewport (390x844)...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ]
  });

  const context = await browser.newContext({
    permissions: ['camera'],
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  });
  const page = await context.newPage();

  // Log in as real customer
  await page.goto('http://localhost:5173/');
  await page.evaluate(() => {
    localStorage.setItem('zoorup_current_user', JSON.stringify({
      id: 'cust_999',
      customer_id: 'ZUP-CUS-888999',
      name: 'Ravi Singh',
      role: 'customer'
    }));
    localStorage.setItem('zoorup_auth_token', 'mock_jwt_token_cust');
  });

  console.log('Navigating to http://localhost:5173/customer/scan-qr on mobile...');
  await page.goto('http://localhost:5173/customer/scan-qr', { waitUntil: 'networkidle' });

  // Wait 1.5 seconds for video to start streaming
  await page.waitForTimeout(1500);

  const screenshotPath = path.join(screenshotsDir, 'customer_qr_scanner_mobile_camera_preview.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot captured: ${screenshotPath}`);

  await browser.close();
}

testWithMobileCameraStream().catch(err => {
  console.error(err);
  process.exit(1);
});
