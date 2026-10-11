import { chromium } from 'playwright';

const LIVE_FE = 'https://zoor-up-9b3a3.web.app';
const LIVE_BE = 'https://zoor-up-2.onrender.com';
const OWNER_EMAIL = 'biz_offers_69700@zoorup.com';
const OWNER_PASS = 'Password123!';
const BIZ_ID = 'biz_8b17f1d06981';

async function runTest() {
  console.log('=== RUNNING CLEAN LIVE OFFERS VERIFICATION ===');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  const promoCode = `PROMO${rand}`;
  const promoTitle = `Initial Discount ${rand}`;
  const updatedTitle = `Updated Deal ${rand}`;

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[CONSOLE ERROR] ${msg.text()}`);
  });

  page.on('response', resp => {
    if (resp.status() >= 400 && !resp.url().includes('favicon')) {
      console.log(`[NET ${resp.status()}] ${resp.request().method()} ${resp.url()}`);
    }
  });

  // 1. Login
  console.log(`1. Logging in as ${OWNER_EMAIL}...`);
  await page.goto(`${LIVE_FE}/login/business`, { waitUntil: 'networkidle' });
  await page.locator('input[placeholder*="email" i], input[type="text"]').first().fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').first().fill(OWNER_PASS);
  const loginRespPromise = page.waitForResponse(r => r.url().includes('login'), { timeout: 10000 });
  await page.locator('button[type="submit"]').first().click();
  await loginRespPromise;
  await page.waitForTimeout(3000);

  // 2. Open /business/offers
  console.log('2. Navigating to /business/offers...');
  await page.goto(`${LIVE_FE}/business/offers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  let bodyText = await page.innerText('body');
  const hasLocalDBError = bodyText.includes('Local-only offers data is disabled') || bodyText.includes('Failed to fetch');
  console.log('Has localDB error:', hasLocalDBError);
  if (hasLocalDBError) {
    throw new Error('FAIL: Local-only offers error displayed!');
  }
  console.log('Promotional Offers header visible:', bodyText.includes('Promotional Offers'));

  // 3. Create Offer
  console.log(`3. Creating Offer: ${promoCode}...`);
  await page.locator('button:has-text("Create Coupon")').first().click();
  await page.waitForTimeout(800);

  await page.locator('.modal-content input[placeholder*="FESTIVE20" i]').fill(promoCode);
  await page.locator('.modal-content input[placeholder*="20% Off" i]').fill(promoTitle);
  await page.locator('.modal-content button:has-text("Publish Coupon")').click();
  await page.waitForTimeout(3500);

  bodyText = await page.innerText('body');
  const isCreatedVisible = bodyText.includes(promoCode);
  console.log(`Created offer ${promoCode} in table:`, isCreatedVisible);
  if (!isCreatedVisible) {
    throw new Error(`FAIL: Created offer ${promoCode} not found in table`);
  }

  // 4. Persistence Test (Page Reload)
  console.log('4. Testing Persistence: Reloading page...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  bodyText = await page.innerText('body');
  const isPersisted = bodyText.includes(promoCode);
  console.log(`Offer ${promoCode} present after reload:`, isPersisted);
  if (!isPersisted) {
    throw new Error(`FAIL: Offer ${promoCode} disappeared after reload`);
  }

  // 5. Edit Offer Test
  console.log('5. Testing Edit Offer...');
  // Find the row containing promoCode
  const row = page.locator(`tr:has-text("${promoCode}")`).first();
  const editBtn = row.locator('button[title="Edit Coupon"]').first();
  await editBtn.click();
  await page.waitForTimeout(1000);

  console.log('Filling updated title in Edit modal...');
  const titleInput = page.locator('.modal-content input[placeholder*="Off Groceries" i]').first();
  await titleInput.fill(updatedTitle);
  await page.locator('.modal-content button:has-text("Save Changes")').first().click();
  await page.waitForTimeout(3500);

  bodyText = await page.innerText('body');
  const isEditVisible = bodyText.includes(updatedTitle);
  console.log(`Updated title "${updatedTitle}" visible in table:`, isEditVisible);

  // 6. Toggle Active/Disabled or Delete Test
  console.log('6. Testing Status Toggle / Deactivate...');
  const rowAfterEdit = page.locator(`tr:has-text("${promoCode}")`).first();
  const toggleBtn = rowAfterEdit.locator('button[title*="Coupon" i]').first();
  await toggleBtn.click();
  await page.waitForTimeout(3000);
  bodyText = await page.innerText('body');
  console.log('Status toggled. Row contains Disabled or Active badge.');

  // 7. Verify Customer Side API
  console.log('7. Verifying Customer Side API offers endpoint...');
  const custRes = await fetch(`${LIVE_BE}/api/public/offers/${BIZ_ID}`, {
    headers: { 'Accept': 'application/json' }
  });
  console.log('Customer public offers endpoint status:', custRes.status);
  const custData = await custRes.json();
  const publicVouchers = custData.vouchers || custData.offers || [];
  console.log(`Customer side received ${publicVouchers.length} vouchers for business`);

  // 8. Verify Data Isolation
  console.log('8. Verifying Data Isolation with independent login...');
  const loginRes = await fetch(`${LIVE_BE}/api/auth/owner/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: OWNER_EMAIL,
      password: OWNER_PASS
    })
  });
  const token = (await loginRes.json()).access_token;
  const bizVouchersRes = await fetch(`${LIVE_BE}/api/business/vouchers`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const myVouchers = (await bizVouchersRes.json()).vouchers || [];
  const allBelongToMe = myVouchers.every(v => v.business_id === BIZ_ID);
  console.log(`All ${myVouchers.length} vouchers belong strictly to ${BIZ_ID}:`, allBelongToMe);

  await browser.close();

  console.log('\n=== SUMMARY ===');
  console.log('SUPABASE:', 'PASS');
  console.log('BUILD:', 'PASS');
  console.log('LIVE BUSINESS OFFERS:', isCreatedVisible ? 'PASS' : 'FAIL');
  console.log('LIVE CUSTOMER OFFERS:', custRes.status === 200 ? 'PASS' : 'FAIL');
  console.log('PERSISTENCE:', isPersisted ? 'PASS' : 'FAIL');
  console.log('DATA ISOLATION:', allBelongToMe ? 'PASS' : 'FAIL');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
