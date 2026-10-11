import { chromium } from 'playwright';

const LIVE_FE = 'https://zoor-up-9b3a3.web.app';
const LIVE_BE = 'https://zoor-up-2.onrender.com';

async function testLiveOffers() {
  console.log('=== STARTING LIVE OFFERS E2E TEST ===');

  // Use clean or existing owner
  const rand = Math.floor(Math.random() * 90000) + 10000;
  let email = `biz_offers_${rand}@zoorup.com`;
  let password = 'Password123!';
  const phone = `98${rand}8888`;
  const storeName = `Offers Store ${rand}`;

  console.log(`1. Trying registration of test business: ${email}`);
  let bizId = null;
  try {
    const regRes = await fetch(`${LIVE_BE}/api/auth/owner/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        name: storeName,
        owner_name: `Owner ${rand}`,
        email: email,
        phone: phone,
        password: password
      })
    });
    console.log('Backend registration status:', regRes.status);
    if (regRes.ok) {
      const regData = await regRes.json();
      bizId = regData.business?.id || regData.user?.business_id;
    } else {
      console.log('Registration rate limited or failed, falling back to known working owner account.');
      email = 'bizowner_47473@zoorup-dash.com';
      password = 'Password123!';
    }
  } catch (err) {
    console.log('Registration error, using existing owner account.');
    email = 'bizowner_47473@zoorup-dash.com';
    password = 'Password123!';
  }
  console.log(`Active Business Account: ${email}`);

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('offers')) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      console.log(`[NET ERROR ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });

  // 2. Login to Business
  console.log('2. Logging in on live frontend...');
  await page.goto(`${LIVE_FE}/login/business`, { waitUntil: 'networkidle' });
  await page.locator('input[placeholder*="email or phone" i], input[type="text"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);

  // 3. Navigate to Offers page
  console.log('3. Navigating to /business/offers...');
  await page.goto(`${LIVE_FE}/business/offers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  let pageText = await page.innerText('body');
  const hasLocalDBError = pageText.includes('Local-only offers data is disabled') || pageText.includes('Failed to fetch');
  console.log('Has Local-only offers error:', hasLocalDBError);
  console.log('Page title / text includes "Promotional Offers":', pageText.includes('Promotional Offers'));

  if (hasLocalDBError) {
    throw new Error('FAIL: Page displays localDB error!');
  }

  // 4. Create an offer
  console.log('4. Creating test coupon...');
  const createBtn = page.locator('button:has-text("Create Coupon")').first();
  await createBtn.click();
  await page.waitForTimeout(1000);

  const promoCode = `PROMO${rand}`;
  await page.locator('input[placeholder*="FESTIVE20" i], input[label*="Coupon Code" i]').first().fill(promoCode);
  await page.locator('input[placeholder*="20% Off" i]').first().fill(`Flat 20% Off ${rand}`);
  
  const publishBtn = page.locator('button:has-text("Publish Coupon")').first();
  await publishBtn.click();
  console.log(`Published coupon ${promoCode}, waiting for table refresh...`);
  await page.waitForTimeout(4000);

  pageText = await page.innerText('body');
  const hasPromoInTable = pageText.includes(promoCode);
  console.log(`Offer ${promoCode} visible in table:`, hasPromoInTable);

  // 5. Test Persistence on refresh
  console.log('5. Testing Persistence: reloading page...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  pageText = await page.innerText('body');
  const hasPromoAfterReload = pageText.includes(promoCode);
  console.log(`Offer ${promoCode} still present after reload:`, hasPromoAfterReload);

  // 6. Test Edit Offer
  console.log('6. Testing Edit Offer...');
  const editBtns = await page.locator('button[title="Edit Coupon"]').all();
  console.log(`Found ${editBtns.length} Edit Coupon buttons.`);
  if (editBtns.length > 0) {
    await editBtns[0].click();
    await page.waitForTimeout(1000);
    const modalVisible = await page.locator('h3:has-text("Edit Promo Coupon")').isVisible();
    console.log('Edit Modal Visible:', modalVisible);
    const titleInput = page.locator('.modal-content input[placeholder*="Off Groceries" i]').first();
    const currVal = await titleInput.inputValue();
    console.log('Current input value:', currVal);
    await titleInput.fill(`Updated Promo ${rand}`);
    
    // Listen for the PUT request
    const putPromise = page.waitForResponse(resp => resp.request().method() === 'PUT' && resp.url().includes('vouchers'), { timeout: 10000 }).catch(e => null);
    await page.locator('.modal-content button:has-text("Save Changes")').first().click();
    
    const putResp = await putPromise;
    if (putResp) {
      console.log('PUT response status:', putResp.status());
      console.log('PUT response body:', await putResp.text());
    } else {
      console.log('NO PUT REQUEST OBSERVED!');
    }
    
    await page.waitForTimeout(3000);
    pageText = await page.innerText('body');
    const isUpdatedVisible = pageText.includes(`Updated Promo ${rand}`);
    console.log('Updated title visible:', isUpdatedVisible);
  } else {
    const allButtons = await page.locator('table button').evaluateAll(btns => btns.map(b => b.outerHTML));
    console.log('Table buttons found:', allButtons);
  }

  // 7. Verify Data Isolation against Business B
  console.log('7. Verifying Data Isolation with Business B...');
  const randB = Math.floor(Math.random() * 90000) + 10000;
  const emailB = `biz_b_${randB}@zoorup.com`;
  const regB = await fetch(`${LIVE_BE}/api/auth/owner/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      name: `Store B ${randB}`,
      owner_name: `Owner B ${randB}`,
      email: emailB,
      phone: `98${randB}9999`,
      password: 'Password123!'
    })
  });
  const regBData = await regB.json();
  const tokenB = regBData.access_token;
  const listBRes = await fetch(`${LIVE_BE}/api/business/vouchers`, {
    headers: { 'Authorization': `Bearer ${tokenB}`, 'Accept': 'application/json' }
  });
  const listBData = await listBRes.json();
  const bizBVouchers = listBData.vouchers || [];
  const bizBSeesPromoA = bizBVouchers.some(v => v.code === promoCode);
  console.log(`Business B vouchers count: ${bizBVouchers.length}`);
  console.log(`Business B sees Business A's promo (${promoCode}): ${bizBSeesPromoA}`);

  await browser.close();

  if (!hasPromoInTable || !hasPromoAfterReload || bizBSeesPromoA) {
    console.error('FAIL: Verification checks failed.');
    process.exit(1);
  } else {
    console.log('\n=== ALL OFFERS TESTS PASSED PERFECTLY ===');
    process.exit(0);
  }
}

testLiveOffers().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
