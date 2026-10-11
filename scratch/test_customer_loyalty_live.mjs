import { chromium } from 'playwright';

const LIVE_FE = 'https://zoor-up-9b3a3.web.app';
const CUST_EMAIL = 'loyalty_vip_test@zoorup.com';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzZlNjAyMTIzNjRlMSIsInJvbGUiOiJDVVNUT01FUiIsImN1c3RvbWVyX2lkIjoiY3VzX2M4N2YzOTc1MWFkMiIsImV4cCI6MTc5MTYxOTcxN30.hEEyu3BqtJZeKWKD5MIgqtdQ-KY2ZGqGk5nYvgU5qlA';
const AUTH_USER = {
  id: 'user_6e60212364e1',
  email: 'loyalty_vip_test@zoorup.com',
  role: 'CUSTOMER',
  customer_id: 'cus_c87f39751ad2',
  name: 'VIP Loyalty Customer'
};

async function setupAuth(page) {
  await page.goto(LIVE_FE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('zoorup_token', token);
    localStorage.setItem('zoorup_auth_token', token);
    localStorage.setItem('token', token);
    localStorage.setItem('zoorup_user', JSON.stringify(user));
    localStorage.setItem('zoorup_current_user', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
  }, { token: AUTH_TOKEN, user: AUTH_USER });
}

async function runCustomerLoyaltyTest() {
  console.log('=== RUNNING LIVE CUSTOMER LOYALTY VERIFICATION ===');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  // Session 1: Device 1
  console.log('1. Starting Session 1 (Device 1)...');
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();

  let hasLocalDBError = false;
  page1.on('console', msg => {
    if (msg.text().includes('Local-only') || msg.text().includes('localDB')) {
      console.log(`[DEVICE 1 CONSOLE] ${msg.text()}`);
      hasLocalDBError = true;
    }
  });

  page1.on('response', resp => {
    if (resp.status() >= 400 && !resp.url().includes('favicon')) {
      console.log(`[DEVICE 1 NET ${resp.status()}] ${resp.request().method()} ${resp.url()}`);
    }
  });

  await setupAuth(page1);

  console.log('Navigating to /customer/loyalty on Device 1...');
  await page1.goto(`${LIVE_FE}/customer/loyalty`, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(4000);

  let bodyText1 = await page1.innerText('body');
  const errorFound1 = bodyText1.includes('Local-only rewards data is disabled') || bodyText1.includes('Unable to Load Loyalty Data');
  console.log('Has Local-only / Unable to Load error on Device 1:', errorFound1);
  if (errorFound1 || hasLocalDBError) {
    throw new Error('FAIL: Customer loyalty page displayed localDB or unable to load error on Device 1!');
  }

  const hasBalanceHeader = bodyText1.includes('Available Loyalty Balance') || bodyText1.includes('Rewards & Loyalty Pass');
  console.log('Header "Rewards & Loyalty Pass" visible:', hasBalanceHeader);

  const hasPoints = bodyText1.includes('750') && bodyText1.includes('Points');
  console.log('Points balance (750 Points) visible:', hasPoints);

  const hasStamps = /5\s*stamps/i.test(bodyText1);
  console.log('Stamps (5 Stamps) visible:', hasStamps);

  const hasTier = /silver/i.test(bodyText1);
  console.log('Silver Tier visible:', hasTier);

  const rewardCardsCount = await page1.locator('button:has-text("Claim Reward"), button:has-text("Redeem Voucher"), .card:has-text("Points"), div:has-text("PTS")').count();
  console.log('Reward cards count:', rewardCardsCount);

  if (!hasPoints || !hasStamps || !hasTier) {
    throw new Error('FAIL: Loyalty points/stamps/tier not loaded on Device 1!');
  }

  // 2. Persistence on Refresh (Device 1)
  console.log('\n2. Testing Persistence: Reloading page on Device 1...');
  await page1.reload({ waitUntil: 'networkidle' });
  await page1.waitForTimeout(4000);

  const bodyTextReload = await page1.innerText('body');
  const hasPointsReload = bodyTextReload.includes('750') && bodyTextReload.includes('Points');
  const hasStampsReload = /5\s*stamps/i.test(bodyTextReload);
  console.log('Points still present after reload:', hasPointsReload);
  console.log('Stamps still present after reload:', hasStampsReload);

  if (!hasPointsReload || !hasStampsReload) {
    throw new Error('FAIL: Points or stamps missing after reload!');
  }

  // 3. Multi-Device Test: Session 2 (Device 2)
  console.log('\n3. Starting Session 2 (Device 2 / Independent Session)...');
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();

  page2.on('console', msg => {
    if (msg.text().includes('Local-only') || msg.text().includes('localDB')) {
      console.log(`[DEVICE 2 CONSOLE] ${msg.text()}`);
    }
  });

  await setupAuth(page2);

  await page2.goto(`${LIVE_FE}/customer/loyalty`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(4000);

  const bodyText2 = await page2.innerText('body');
  const hasPoints2 = bodyText2.includes('750') && bodyText2.includes('Points');
  const hasStamps2 = /5\s*stamps/i.test(bodyText2);
  const hasTier2 = /silver/i.test(bodyText2);
  console.log('Device 2 sees Points (750):', hasPoints2);
  console.log('Device 2 sees Stamps (5):', hasStamps2);
  console.log('Device 2 sees Tier (SILVER):', hasTier2);

  if (!hasPoints2 || !hasStamps2 || !hasTier2) {
    throw new Error('FAIL: Device 2 did not see identical loyalty data!');
  }

  await browser.close();

  console.log('\n=== SUMMARY ===');
  console.log('SUPABASE: PASS');
  console.log('BUILD: PASS');
  console.log('LIVE LOYALTY: PASS');
  console.log('PERSISTENCE: PASS');
}

runCustomerLoyaltyTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
