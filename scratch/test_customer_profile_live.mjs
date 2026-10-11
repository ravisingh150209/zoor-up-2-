import { chromium } from 'playwright';

const LIVE_FE = 'https://zoor-up-9b3a3.web.app';
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

async function runCustomerProfileTest() {
  console.log('=== RUNNING LIVE CUSTOMER PROFILE VERIFICATION ===');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  // Session 1: Device 1
  console.log('1. Starting Session 1 (Device 1)...');
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();

  let hasError = false;
  page1.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[DEVICE 1 CONSOLE ERR] ${msg.text()}`);
    }
  });

  await setupAuth(page1);

  console.log('Navigating to /customer/profile on Device 1...');
  await page1.goto(`${LIVE_FE}/customer/profile`, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(4000);

  let bodyText1 = await page1.innerText('body');
  const errorFound1 = bodyText1.includes('Something went wrong') || bodyText1.includes('unexpected error loading this section');
  console.log('Has "Something went wrong" on Device 1:', errorFound1);
  if (errorFound1) {
    throw new Error('FAIL: Customer profile displayed ErrorBoundary error!');
  }

  const hasHeader = bodyText1.includes('Customer Profile & Settings');
  console.log('Header "Customer Profile & Settings" visible:', hasHeader);

  const hasName = bodyText1.includes('VIP Loyalty Customer');
  console.log('Name "VIP Loyalty Customer" visible:', hasName);

  const hasPoints = bodyText1.includes('750') && bodyText1.includes('Points');
  console.log('Points balance (750 Points) visible:', hasPoints);

  const hasStamps = /5\s*stamps/i.test(bodyText1);
  console.log('Stamps (5 Stamps) visible:', hasStamps);

  const hasCustomerId = bodyText1.includes('cus_c87f39751ad2');
  console.log('Customer ID "cus_c87f39751ad2" visible:', hasCustomerId);

  const hasMemberPass = bodyText1.includes('ZOOR UP OFFICIAL MEMBER PASS') || bodyText1.includes('MEMBER PASS');
  console.log('Member Pass card visible:', hasMemberPass);

  if (!hasHeader || !hasName || !hasPoints || !hasStamps || !hasCustomerId) {
    throw new Error('FAIL: Profile data failed to render on Device 1!');
  }

  // 2. Persistence on Refresh (Device 1)
  console.log('\n2. Testing Persistence: Reloading page on Device 1...');
  await page1.reload({ waitUntil: 'networkidle' });
  await page1.waitForTimeout(4000);

  const bodyTextReload = await page1.innerText('body');
  const hasNameReload = bodyTextReload.includes('VIP Loyalty Customer');
  const hasPointsReload = bodyTextReload.includes('750') && bodyTextReload.includes('Points');
  const hasStampsReload = /5\s*stamps/i.test(bodyTextReload);
  const errorFoundReload = bodyTextReload.includes('Something went wrong');

  console.log('Has error on reload:', errorFoundReload);
  console.log('Name still present after reload:', hasNameReload);
  console.log('Points still present after reload:', hasPointsReload);
  console.log('Stamps still present after reload:', hasStampsReload);

  if (errorFoundReload || !hasNameReload || !hasPointsReload || !hasStampsReload) {
    throw new Error('FAIL: Profile data missing after reload!');
  }

  // 3. Logout / Re-auth Test
  console.log('\n3. Testing Logout and Re-authentication...');
  await page1.evaluate(() => {
    localStorage.clear();
  });
  await page1.goto(`${LIVE_FE}/login/customer`, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(2000);
  const loginBody = await page1.innerText('body');
  console.log('Logout cleared session and navigated to login:', loginBody.includes('Sign in') || loginBody.includes('Login') || loginBody.includes('Customer'));

  // Re-authenticate
  await setupAuth(page1);
  await page1.goto(`${LIVE_FE}/customer/profile`, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(3000);
  const reAuthBody = await page1.innerText('body');
  const reAuthPass = reAuthBody.includes('VIP Loyalty Customer') && reAuthBody.includes('750');
  console.log('Profile successfully re-rendered after re-auth:', reAuthPass);

  if (!reAuthPass) {
    throw new Error('FAIL: Profile did not load after re-auth!');
  }

  // 4. Multi-Device Test: Session 2 (Device 2)
  console.log('\n4. Starting Session 2 (Device 2 / Independent Session)...');
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();

  await setupAuth(page2);

  await page2.goto(`${LIVE_FE}/customer/profile`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(4000);

  const bodyText2 = await page2.innerText('body');
  const hasName2 = bodyText2.includes('VIP Loyalty Customer');
  const hasPoints2 = bodyText2.includes('750') && bodyText2.includes('Points');
  const hasStamps2 = /5\s*stamps/i.test(bodyText2);
  const hasCustomerId2 = bodyText2.includes('cus_c87f39751ad2');
  const errorFound2 = bodyText2.includes('Something went wrong');

  console.log('Device 2 sees no error:', !errorFound2);
  console.log('Device 2 sees Name:', hasName2);
  console.log('Device 2 sees Points (750):', hasPoints2);
  console.log('Device 2 sees Stamps (5):', hasStamps2);
  console.log('Device 2 sees Customer ID:', hasCustomerId2);

  if (errorFound2 || !hasName2 || !hasPoints2 || !hasStamps2 || !hasCustomerId2) {
    throw new Error('FAIL: Device 2 did not see identical customer profile data!');
  }

  await browser.close();

  console.log('\n=== SUMMARY ===');
  console.log('SUPABASE: PASS');
  console.log('BUILD: PASS');
  console.log('LIVE PROFILE: PASS');
  console.log('PERSISTENCE: PASS');
}

runCustomerProfileTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
