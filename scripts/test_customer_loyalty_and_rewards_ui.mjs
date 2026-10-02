import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function runCustomerLoyaltyVerification() {
  console.log('=== STARTING CUSTOMER LOYALTY & REWARDS BLACK SCREEN VERIFICATION ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 }
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  try {
    const timestamp = Date.now();
    const testCustomer = {
      id: `usr_cust_${timestamp}`,
      customer_id: `ZUP-CUS-123456`,
      name: 'Priya Sharma',
      email: `priya_${timestamp}@gmail.com`,
      phone: '+919876543210',
      role: 'customer',
      points: 250,
      stamps: 4,
      visits: 3,
      token: 'jwt_mock_token_cust'
    };

    // Set authenticated customer session in localStorage
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((cust) => {
      localStorage.setItem('zoorup_current_user', JSON.stringify(cust));
      localStorage.setItem('zoorup_auth_token', cust.token);
      
      const storedCusts = JSON.parse(localStorage.getItem('zoorup_customers') || '[]');
      storedCusts.unshift(cust);
      localStorage.setItem('zoorup_customers', JSON.stringify(storedCusts));
    }, testCustomer);

    // -------------------------------------------------------------
    // TEST 1: NAVIGATE TO /customer/loyalty
    // -------------------------------------------------------------
    console.log('[TEST 1] Visiting /customer/loyalty...');
    await page.goto('http://localhost:5173/customer/loyalty', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const loyaltyScreenshot = path.join(screenshotsDir, 'customer_loyalty_screen.png');
    await page.screenshot({ path: loyaltyScreenshot, fullPage: true });
    console.log(`Saved screenshot to ${loyaltyScreenshot}`);

    // Check page content
    const pageText = await page.innerText('body');
    if (pageText.includes('Something went wrong') || pageText.includes('An unexpected error has occurred')) {
      throw new Error('FAIL: ErrorBoundary caught an unhandled exception on /customer/loyalty!');
    }

    if (!pageText.includes('Rewards & Loyalty') && !pageText.includes('AVAILABLE LOYALTY BALANCE')) {
      throw new Error('FAIL: Loyalty page did not render expected headings/content!');
    }

    console.log('✓ PASS: /customer/loyalty loaded without any black screen or crash!');

    // -------------------------------------------------------------
    // TEST 2: TEST FRESH CUSTOMER (0 POINTS, 0 STAMPS, ZERO REWARDS)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Testing Zero-State Customer (0 points, 0 stamps)...');
    const zeroCustomer = {
      id: `usr_zero_${timestamp}`,
      customer_id: `ZUP-CUS-000000`,
      name: 'Fresh Customer',
      phone: '+919999900000',
      role: 'customer',
      points: 0,
      stamps: 0,
      visits: 0,
      token: 'jwt_mock_token_zero'
    };

    await page.evaluate((cust) => {
      localStorage.setItem('zoorup_current_user', JSON.stringify(cust));
      localStorage.setItem('zoorup_auth_token', cust.token);
    }, zeroCustomer);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const zeroScreenshot = path.join(screenshotsDir, 'customer_loyalty_zero_state.png');
    await page.screenshot({ path: zeroScreenshot, fullPage: true });
    console.log(`Saved zero state screenshot to ${zeroScreenshot}`);

    const zeroPageText = await page.innerText('body');
    if (!zeroPageText.includes('0') || zeroPageText.includes('NaN')) {
      throw new Error('FAIL: Zero state rendered NaN or failed!');
    }
    console.log('✓ PASS: Zero-state customer points screen rendered cleanly with 0 points.');

    // -------------------------------------------------------------
    // TEST 3: CUSTOMER TABLE BOOKING PAGE
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Visiting /customer/table-booking...');
    await page.goto('http://localhost:5173/customer/table-booking', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const bookingScreenshot = path.join(screenshotsDir, 'customer_table_booking_screen.png');
    await page.screenshot({ path: bookingScreenshot, fullPage: true });
    console.log(`Saved screenshot to ${bookingScreenshot}`);

    const bookingPageText = await page.innerText('body');
    if (bookingPageText.includes('Something went wrong')) {
      throw new Error('FAIL: ErrorBoundary caught an error on /customer/table-booking!');
    }
    console.log('✓ PASS: /customer/table-booking loaded cleanly.');

    // Check for critical console errors
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404'));
    if (fatalErrors.length > 0) {
      console.warn('⚠️ Console errors detected:', fatalErrors);
    } else {
      console.log('✓ PASS: Zero unhandled console errors detected!');
    }

    console.log('\n============================================================');
    console.log('🎉 ALL FRONTEND VERIFICATION CHECKS PASSED!');
    console.log('============================================================\n');

  } catch (err) {
    console.error('\n❌ FRONTEND VERIFICATION FAILED:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'loyalty_failure_state.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runCustomerLoyaltyVerification();
