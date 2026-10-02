import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

console.log('================================================================');
console.log('ZOOR UP — CUSTOMER QR SCANNER AUTOMATED VERIFICATION SUITE');
console.log('================================================================\n');

async function runTests() {
  const browser = await chromium.launch({ headless: true });

  // TEST 1: Unauthenticated User Redirection
  console.log('--- TEST 1: Unauthenticated User Redirection ---');
  const unauthContext = await browser.newContext();
  const unauthPage = await unauthContext.newPage();
  await unauthPage.goto('http://localhost:5173/customer/scan-qr', { waitUntil: 'networkidle' });
  const unauthUrl = unauthPage.url();
  console.log(`  Current URL: ${unauthUrl}`);
  if (unauthUrl.includes('/login')) {
    console.log('  ✅ TEST 1 PASSED: Unauthenticated user safely redirected to login.\n');
  } else {
    throw new Error(`Expected redirect to /login, but remained at ${unauthUrl}`);
  }
  await unauthContext.close();

  // TEST 2: Role Guard (Business Owner redirection)
  console.log('--- TEST 2: Role Guard (Business Owner redirection) ---');
  const bizContext = await browser.newContext();
  const bizPage = await bizContext.newPage();
  await bizPage.goto('http://localhost:5173/');
  await bizPage.evaluate(() => {
    localStorage.setItem('zoorup_current_user', JSON.stringify({
      id: 'biz_owner_1',
      email: 'owner@cafe.test',
      role: 'business'
    }));
    localStorage.setItem('zoorup_auth_token', 'mock_jwt_token_biz');
  });
  await bizPage.goto('http://localhost:5173/customer/scan-qr', { waitUntil: 'networkidle' });
  const bizUrl = bizPage.url();
  console.log(`  Current URL: ${bizUrl}`);
  if (bizUrl.includes('/business')) {
    console.log('  ✅ TEST 2 PASSED: Business owner redirected to business dashboard.\n');
  } else {
    throw new Error(`Expected redirect to /business, got ${bizUrl}`);
  }
  await bizContext.close();

  // TEST 3: Authenticated Customer Access & Camera Viewport DOM Persistence
  console.log('--- TEST 3: Authenticated Customer Access & DOM Persistence ---');
  const custContext = await browser.newContext({
    permissions: ['camera']
  });
  const custPage = await custContext.newPage();
  
  // Set real customer session
  await custPage.goto('http://localhost:5173/');
  await custPage.evaluate(() => {
    localStorage.setItem('zoorup_current_user', JSON.stringify({
      id: 'cust_999',
      customer_id: 'ZUP-CUS-888999',
      name: 'Ravi Singh',
      role: 'customer'
    }));
    localStorage.setItem('zoorup_auth_token', 'mock_jwt_token_cust');
  });

  const pageErrors = [];
  custPage.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('React Router')) {
      pageErrors.push(msg.text());
    }
  });

  await custPage.goto('http://localhost:5173/customer/scan-qr', { waitUntil: 'networkidle' });
  console.log(`  Current URL: ${custPage.url()}`);

  // Check DOM element persistence
  const viewportExists = await custPage.locator('#zoorup-customer-camera-viewport').count();
  console.log(`  #zoorup-customer-camera-viewport count in DOM: ${viewportExists}`);
  if (viewportExists > 0) {
    console.log('  ✓ Camera viewport element #zoorup-customer-camera-viewport is firmly present in DOM on mount!');
  } else {
    throw new Error('Camera viewport element was not found in DOM!');
  }

  // Check instructions
  const topText = await custPage.textContent('body');
  const hasTopInst = topText.includes('QR code ko frame ke andar rakhein');
  const hasBottomInst = topText.includes('QR code scan karein');
  console.log(`  Instruction "QR code ko frame ke andar rakhein": ${hasTopInst}`);
  console.log(`  Instruction "QR code scan karein": ${hasBottomInst}`);
  if (!hasTopInst || !hasBottomInst) {
    throw new Error('Missing required Hindi/English scanning instructions!');
  }
  console.log('  ✅ TEST 3 PASSED: DOM element and instructions verified.\n');

  const scPathScanning = path.join(screenshotsDir, 'customer_qr_scanner_mounted.png');
  await custPage.screenshot({ path: scPathScanning });
  console.log(`  ✓ Screenshot saved: ${scPathScanning}`);

  // TEST 4: Real QR Resolution Service Tests
  console.log('\n--- TEST 4: QR Code Resolution & Validation Suite ---');
  const { qrService } = await import('../src/services/qrService.js');

  // 4a. MENU QR URL
  const menuRes = await qrService.resolveQR('https://app.zoorup.com/menu/green-leaf-grocery');
  console.log('  4a. Menu QR URL:', menuRes.type, menuRes.business_slug, menuRes.target_url);
  if (menuRes.success && menuRes.type === 'MENU') {
    console.log('  ✓ Menu QR successfully validated and resolved');
  } else {
    throw new Error('Menu QR resolution failed');
  }

  // 4b. CHECK-IN QR URL
  const checkinRes = await qrService.resolveQR('https://app.zoorup.com/checkin/biz_1');
  console.log('  4b. Check-in QR URL:', checkinRes.type, checkinRes.business_id);
  if (checkinRes.success && checkinRes.type === 'CHECKIN') {
    console.log('  ✓ Check-in QR successfully validated and resolved');
  } else {
    throw new Error('Check-in QR resolution failed');
  }

  // 4c. LOYALTY QR URL
  const loyaltyRes = await qrService.resolveQR('https://app.zoorup.com/loyalty/biz_1');
  console.log('  4c. Loyalty QR URL:', loyaltyRes.type, loyaltyRes.business_id);
  if (loyaltyRes.success && loyaltyRes.type === 'LOYALTY') {
    console.log('  ✓ Loyalty QR successfully validated and resolved');
  } else {
    throw new Error('Loyalty QR resolution failed');
  }

  // 4d. CUSTOMER PASS QR URL
  const cusRes = await qrService.resolveQR('https://app.zoorup.com/customer/ZUP-CUS-100001');
  console.log('  4d. Customer Pass QR URL:', cusRes.type, cusRes.customer_id);
  if (cusRes.success && cusRes.type === 'CUSTOMER') {
    console.log('  ✓ Customer Pass QR successfully validated and resolved');
  } else {
    throw new Error('Customer Pass QR resolution failed');
  }

  // 4e. JSON QR PAYLOAD
  const jsonRes = await qrService.resolveQR(JSON.stringify({ type: 'checkin', business_id: 'biz_1' }));
  console.log('  4e. JSON Check-in Payload:', jsonRes.type, jsonRes.business_id);
  if (jsonRes.success && jsonRes.type === 'CHECKIN') {
    console.log('  ✓ JSON Check-in QR successfully validated and resolved');
  } else {
    throw new Error('JSON Check-in QR resolution failed');
  }

  // 4f. INVALID QR CODE
  const invalidRes = await qrService.resolveQR('https://malicious-random-site.com/steal-data');
  console.log('  4f. Invalid QR Data Result:', invalidRes.success, invalidRes.error);
  if (!invalidRes.success && invalidRes.error.includes('Invalid QR')) {
    console.log('  ✓ Invalid QR correctly rejected with error message');
  } else {
    throw new Error('Invalid QR was not rejected!');
  }
  console.log('  ✅ TEST 4 PASSED: All 6 QR types validated.\n');

  await custContext.close();
  await browser.close();

  console.log('================================================================');
  console.log('ALL CUSTOMER QR SCANNER TESTS PASSED! (100% SUCCESS)');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
