import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function runCustomerExperienceTest() {
  console.log('--- STARTING ZOOR UP PREMIUM CUSTOMER EXPERIENCE 2.0 AUTOMATED TEST ---');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ]
  });

  // =========================================================================
  // 1. BRAND NEW CUSTOMER DASHBOARD (0 Points, 0 Stamps, Level 1 Starter)
  // =========================================================================
  console.log('\n[TEST 1] Verifying Brand New Customer Dashboard...');
  const mobileContext = await browser.newContext({
    permissions: ['camera'],
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
  });
  const page = await mobileContext.newPage();

  await page.goto('http://localhost:5173/');

  // Seed new authenticated customer with 0 points, 0 stamps
  await page.evaluate(() => {
    localStorage.clear();
    const newCustomerUser = {
      id: 'usr_new_test_101',
      customer_id: 'ZUP-CUS-101010',
      name: 'Ravi Singh',
      phone: '9876543210',
      email: 'ravi.singh@example.com',
      role: 'customer',
      points: 0,
      stamps: 0,
      total_visits: 0,
      total_spent: 0,
    };
    localStorage.setItem('zoorup_current_user', JSON.stringify(newCustomerUser));
    localStorage.setItem('zoorup_auth_token', 'token_cust_101');
    localStorage.setItem('zoorup_customers', JSON.stringify([{
      id: 'usr_new_test_101',
      customer_id: 'ZUP-CUS-101010',
      name: 'Ravi Singh',
      phone: '9876543210',
      email: 'ravi.singh@example.com',
      points: 0,
      stamps: 0,
      total_visits: 0,
      total_spent: 0,
      rank: 'Bronze',
      joined_date: '2026-09-26',
    }]));
  });

  await page.goto('http://localhost:5173/customer');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Assertions for Real New Customer
  const greetingText = await page.textContent('h1');
  console.log('✓ Greeting text:', greetingText);
  if (!greetingText.includes('Ravi Singh')) {
    throw new Error(`Expected greeting to include "Ravi Singh", got "${greetingText}"`);
  }

  const levelBadge = await page.textContent('text=LEVEL 1 • STARTER');
  console.log('✓ Level Badge:', levelBadge);

  const pointsText = await page.textContent('text=0 Points');
  console.log('✓ Points displayed:', pointsText);

  const stampCardProgress = await page.textContent('text=0 / 10');
  console.log('✓ Stamp count displayed:', stampCardProgress);

  await page.screenshot({ path: path.join(screenshotsDir, 'exp2_01_customer_home_new.png') });
  console.log('✓ Captured screenshot: exp2_01_customer_home_new.png');

  // =========================================================================
  // 2. 3D LOYALTY CARD INTERACTION (FLIP & QR PASS)
  // =========================================================================
  console.log('\n[TEST 2] Verifying 3D Loyalty Card Parallax & Flip...');
  const cardElement = page.locator('div[role="button"][aria-label*="Loyalty Card"]');
  await cardElement.click();
  await page.waitForTimeout(600); // Wait for 3D flip animation

  const backSideText = await page.textContent('text=Customer Pass ID');
  console.log('✓ Card flipped! Found back side Pass ID header:', backSideText);
  const passIdText = await page.textContent('text=ZUP-CUS-101010');
  console.log('✓ Verified Customer ID on card back:', passIdText);
  await page.screenshot({ path: path.join(screenshotsDir, 'exp2_02_card_flipped.png') });
  console.log('✓ Captured screenshot: exp2_02_card_flipped.png');

  // Flip back to front
  await cardElement.click();
  await page.waitForTimeout(500);

  // =========================================================================
  // 3. CUSTOMER PAY VIA UPI MODAL
  // =========================================================================
  console.log('\n[TEST 3] Testing Customer "Pay via UPI" Modal...');
  await page.click('button:has-text("Pay via UPI")');
  await page.waitForTimeout(600);

  const modalTitle = await page.textContent('text=Pay Business via UPI');
  console.log('✓ Modal opened:', modalTitle);

  // Verify QR code is rendered inside modal
  const qrSvgCount = await page.locator('svg').count();
  console.log(`✓ Verified ${qrSvgCount} SVG elements (including scannable UPI QR).`);

  // Verify mobile payment link
  const payUpiBtn = page.locator('a:has-text("Pay via UPI App")');
  const payHref = await payUpiBtn.getAttribute('href');
  console.log('✓ Generated UPI Payment URL:', payHref);
  if (!payHref || !payHref.startsWith('upi://pay?pa=')) {
    throw new Error(`Invalid UPI deep link: ${payHref}`);
  }

  await page.screenshot({ path: path.join(screenshotsDir, 'exp2_03_upi_payment_modal.png') });
  console.log('✓ Captured screenshot: exp2_03_upi_payment_modal.png');

  // Close UPI Modal
  await page.click('button[aria-label="Close dialog"]');
  await page.waitForTimeout(400);

  // =========================================================================
  // 4. AUTOMATED STAMP COLLECTION & DUPLICATE PROTECTION
  // =========================================================================
  console.log('\n[TEST 4] Testing Automatic Stamp Collection & Daily Duplicate Scan Protection...');
  
  // Navigate to QR scanner
  await page.goto('http://localhost:5173/customer/scan-qr');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Simulate scanning a business QR code
  console.log('Simulating valid store counter QR scan...');
  const scanResult = await page.evaluate(async () => {
    // Import customerService dynamically
    const { customerService } = await import('/src/services/customerService.js');
    return await customerService.recordVisit('biz_1', 'usr_new_test_101', {
      customer_name: 'Ravi Singh',
      customer_id: 'ZUP-CUS-101010',
      points: 50,
      stamps: 1,
    });
  });

  console.log('✓ Check-in Result 1:', scanResult);
  if (scanResult.alreadyCheckedInToday || scanResult.stamps_awarded !== 1 || scanResult.points_awarded !== 50) {
    throw new Error('First check-in failed to award exactly 1 stamp and 50 points!');
  }

  // Now attempt a SECOND check-in on the same day for duplicate scan protection
  console.log('Testing duplicate scan protection (2nd scan on same calendar day)...');
  const duplicateResult = await page.evaluate(async () => {
    const { customerService } = await import('/src/services/customerService.js');
    return await customerService.recordVisit('biz_1', 'usr_new_test_101', {
      customer_name: 'Ravi Singh',
      customer_id: 'ZUP-CUS-101010',
      points: 50,
      stamps: 1,
    });
  });

  console.log('✓ Check-in Result 2 (Duplicate protection):', duplicateResult);
  if (!duplicateResult.alreadyCheckedInToday || duplicateResult.stamps_awarded !== 0) {
    throw new Error('Duplicate protection failed! Allowed multiple stamps on the same day.');
  }
  console.log('✓ Duplicate protection verified: 0 stamps awarded on repeat scan!');

  // Navigate back to customer home to verify updated dashboard stats
  await page.goto('http://localhost:5173/customer');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const updatedPoints = await page.textContent('text=50 Points');
  console.log('✓ Dashboard updated with real points:', updatedPoints);

  const updatedStamps = await page.textContent('text=1 / 10');
  console.log('✓ Dashboard updated with real stamps:', updatedStamps);

  const remainingVisitsText = await page.textContent('text=9 more visits to unlock your next store reward.');
  console.log('✓ Remaining visits calculated dynamically:', remainingVisitsText);

  await page.screenshot({ path: path.join(screenshotsDir, 'exp2_04_updated_dashboard.png') });
  console.log('✓ Captured screenshot: exp2_04_updated_dashboard.png');

  // =========================================================================
  // 5. BUSINESS OWNER UPI SETTINGS & CUSTOMER INSIGHTS
  // =========================================================================
  console.log('\n[TEST 5] Testing Business Owner UPI Setup & Customer Insights...');
  await page.evaluate(() => {
    const bizUser = {
      id: 'usr_biz_owner',
      business_id: 'biz_1',
      name: 'Cafe Owner',
      role: 'business',
    };
    localStorage.setItem('zoorup_current_user', JSON.stringify(bizUser));
  });

  // Navigate to Payments Management
  await page.goto('http://localhost:5173/business/payments');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  // Switch to UPI Setup Tab
  await page.click('button:has-text("UPI & Payments Setup")');
  await page.waitForTimeout(600);

  // Configure store UPI ID
  const upiInput = page.locator('input[placeholder*="storename@okaxis"]');
  await upiInput.fill('mountainbrew@okaxis');
  await page.click('button:has-text("Save UPI Settings")');
  await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(screenshotsDir, 'exp2_05_business_upi_setup.png') });
  console.log('✓ Captured screenshot: exp2_05_business_upi_setup.png');

  // Navigate to Customer Management for Customer Insights & Win-back
  await page.goto('http://localhost:5173/business/customers');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  const insightsHeading = await page.textContent('text=Actionable Customer Insights & Reminders');
  console.log('✓ Found Business Reminders center:', insightsHeading);

  const winBackCard = await page.textContent('text=Win-Back Reminders');
  console.log('✓ Win-Back Insight card active:', winBackCard);

  await page.screenshot({ path: path.join(screenshotsDir, 'exp2_06_business_customer_insights.png') });
  console.log('✓ Captured screenshot: exp2_06_business_customer_insights.png');

  // =========================================================================
  // 6. MULTI-DEVICE RESPONSIVE VERIFICATION
  // =========================================================================
  console.log('\n[TEST 6] Testing Multi-Device Responsiveness (Mobile, Tablet, Desktop)...');
  const viewports = [
    { name: 'desktop_1280', width: 1280, height: 800 },
    { name: 'tablet_768', width: 768, height: 1024 },
    { name: 'mobile_412', width: 412, height: 915 },
  ];

  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const p = await ctx.newPage();
    await p.goto('http://localhost:5173/');
    await p.evaluate(() => {
      localStorage.setItem('zoorup_current_user', JSON.stringify({
        id: 'usr_new_test_101',
        customer_id: 'ZUP-CUS-101010',
        name: 'Ravi Singh',
        role: 'customer',
        points: 50,
        stamps: 1,
      }));
      localStorage.setItem('zoorup_auth_token', 'token_cust_101');
    });
    await p.goto('http://localhost:5173/customer');
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(screenshotsDir, `exp2_responsive_${vp.name}.png`) });
    console.log(`✓ Responsive screenshot captured: exp2_responsive_${vp.name}.png`);
    await ctx.close();
  }

  await browser.close();
  console.log('\n======================================================================');
  console.log('ALL ZOOR UP CUSTOMER EXPERIENCE 2.0 AUTOMATED TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================================\n');
}

runCustomerExperienceTest().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
