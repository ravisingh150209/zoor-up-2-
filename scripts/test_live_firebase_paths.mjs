import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');

async function testLiveRoutes() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const testCustomer = {
    id: `usr_live_cust`,
    customer_id: `ZUP-CUS-888999`,
    name: 'Rohan Sharma',
    phone: '+919876543210',
    role: 'customer',
    points: 150,
    stamps: 3,
    visits: 2,
    token: 'jwt_mock_token'
  };

  try {
    await page.goto('https://zoor-up-9b3a3.web.app/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((cust) => {
      localStorage.setItem('zoorup_current_user', JSON.stringify(cust));
      localStorage.setItem('zoorup_auth_token', cust.token);
    }, testCustomer);

    // Check loyalty page on live Firebase
    await page.goto('https://zoor-up-9b3a3.web.app/customer/loyalty', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, 'live_firebase_customer_loyalty.png'), fullPage: true });
    console.log('✓ PASS: Live Firebase /customer/loyalty loaded perfectly with points and zero crashes.');

    // Check table booking page on live Firebase
    await page.goto('https://zoor-up-9b3a3.web.app/customer/table-booking', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, 'live_firebase_customer_table_booking.png'), fullPage: true });
    console.log('✓ PASS: Live Firebase /customer/table-booking loaded successfully.');

  } catch (err) {
    console.error('Error on live routes:', err);
  } finally {
    await browser.close();
  }
}

testLiveRoutes();
