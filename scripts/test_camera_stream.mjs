import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');

async function testWithCameraStream() {
  console.log('Testing with Chromium virtual camera stream...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ]
  });

  const context = await browser.newContext({
    permissions: ['camera']
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

  console.log('Navigating to http://localhost:5173/customer/scan-qr...');
  await page.goto('http://localhost:5173/customer/scan-qr', { waitUntil: 'networkidle' });

  // Wait 1.5 seconds for video to start streaming
  await page.waitForTimeout(1500);

  const videoCount = await page.locator('#zoorup-customer-camera-viewport video').count();
  console.log(`Video elements attached in #zoorup-customer-camera-viewport: ${videoCount}`);

  const hasTopInst = (await page.textContent('body')).includes('QR code ko frame ke andar rakhein');
  const hasBottomInst = (await page.textContent('body')).includes('QR code scan karein');
  console.log(`Instruction "QR code ko frame ke andar rakhein": ${hasTopInst}`);
  console.log(`Instruction "QR code scan karein": ${hasBottomInst}`);

  const screenshotPath = path.join(screenshotsDir, 'customer_qr_scanner_real_camera_preview.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot captured: ${screenshotPath}`);

  await browser.close();
}

testWithCameraStream().catch(err => {
  console.error(err);
  process.exit(1);
});
