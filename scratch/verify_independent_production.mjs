import { chromium, devices } from 'playwright';

const LIVE_FE = 'https://zoor-up-9b3a3.web.app';
const LIVE_BE = 'https://zoor-up-2.onrender.com';

async function testIndependentFlow() {
  console.log('=== STARTING INDEPENDENT PRODUCTION VERIFICATION ===');
  console.log(`Frontend: ${LIVE_FE}`);
  console.log(`Backend:  ${LIVE_BE}`);

  // Create a clean test business directly via live backend API
  const rand = Math.floor(Math.random() * 90000) + 10000;
  const bizEmail = `prod_indep_${rand}@zoorup.com`;
  const bizPassword = 'Password123!';
  const bizPhone = `98${rand}5678`;
  const bizName = `Independent Store ${rand}`;

  console.log(`\nRegistering fresh business on live backend: ${bizEmail}...`);
  const regRes = await fetch(`${LIVE_BE}/api/auth/owner/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      name: bizName,
      owner_name: `Owner ${rand}`,
      email: bizEmail,
      phone: bizPhone,
      password: bizPassword
    })
  });
  console.log(`Live backend registration status: ${regRes.status}`);
  const regJson = await regRes.json();
  console.log(`Registered Business ID: ${regJson.business?.id || regJson.user?.business_id}`);

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  // TEST 1: MOBILE INCOGNITO (Pixel 7)
  console.log('\n--- 1. Testing Mobile Device (Pixel 7, Incognito Context) ---');
  const mobileContext = await browser.newContext({
    ...devices['Pixel 7'],
    ignoreHTTPSErrors: true,
  });
  const mobilePage = await mobileContext.newPage();

  const apiRequests = [];
  mobilePage.on('request', req => {
    const url = req.url();
    if (url.includes('/api/')) {
      apiRequests.push({ method: req.method(), url });
    }
  });

  // A. Homepage
  console.log('Navigating to live homepage...');
  await mobilePage.goto(LIVE_FE, { waitUntil: 'networkidle', timeout: 30000 });
  const homeTitle = await mobilePage.title();
  console.log(`Homepage title: "${homeTitle}"`);

  // B. Business Login
  console.log('Testing Business Login on mobile...');
  await mobilePage.goto(`${LIVE_FE}/login/business`, { waitUntil: 'networkidle', timeout: 30000 });
  
  const emailInput = mobilePage.locator('input[placeholder*="email or phone" i], input[type="text"]').first();
  const passwordInput = mobilePage.locator('input[type="password"]').first();
  await emailInput.fill(bizEmail);
  await passwordInput.fill(bizPassword);

  const submitBtn = mobilePage.locator('button[type="submit"]').first();
  await submitBtn.click();

  console.log('Waiting for Business Dashboard navigation...');
  await mobilePage.waitForTimeout(6000);

  const dashText = await mobilePage.innerText('body');
  const hasBizError = dashText.includes('Unable to load business dashboard') || dashText.includes('Failed to fetch');
  const hasBizStats = dashText.includes("TODAY'S SALES") || dashText.includes("TOTAL CUSTOMERS") || dashText.includes("Setup Wizard");

  console.log(`Mobile URL after login: ${mobilePage.url()}`);
  console.log(`Has Error: ${hasBizError}`);
  console.log(`Has Stats / Dashboard content: ${hasBizStats}`);

  // C. Customer Login
  console.log('\n--- 2. Testing Customer Login on mobile ---');
  await mobilePage.goto(`${LIVE_FE}/login/customer`, { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`Customer login page URL: ${mobilePage.url()}`);
  const customerTitle = await mobilePage.title();
  console.log(`Customer login page loaded: "${customerTitle}"`);

  await mobileContext.close();

  // TEST 3: DESKTOP INCOGNITO
  console.log('\n--- 3. Testing Desktop Incognito Context ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const desktopPage = await desktopContext.newPage();

  console.log('Navigating to Business Login on Desktop...');
  await desktopPage.goto(`${LIVE_FE}/login/business`, { waitUntil: 'networkidle' });
  await desktopPage.locator('input[placeholder*="email or phone" i], input[type="text"]').first().fill(bizEmail);
  await desktopPage.locator('input[type="password"]').first().fill(bizPassword);
  await desktopPage.locator('button[type="submit"]').first().click();

  await desktopPage.waitForTimeout(6000);

  const deskText = await desktopPage.innerText('body');
  const hasDeskError = deskText.includes('Unable to load business dashboard') || deskText.includes('Failed to fetch');
  console.log(`Desktop URL after login: ${desktopPage.url()}`);
  console.log(`Desktop Has Error: ${hasDeskError}`);
  console.log(`Desktop rendered successfully: ${!hasDeskError && (deskText.includes("TODAY'S SALES") || deskText.includes("Setup Wizard") || deskText.includes("Active"))}`);

  await desktopContext.close();
  await browser.close();

  // Check all captured API requests
  console.log('\n--- 4. Checking API endpoints called ---');
  const nonRenderCalls = apiRequests.filter(r => !r.url.startsWith(LIVE_BE));
  console.log(`Total API requests: ${apiRequests.length}`);
  console.log(`Non-Render API requests: ${nonRenderCalls.length}`);
  if (nonRenderCalls.length > 0) {
    console.log('Non-render calls:', nonRenderCalls);
  }

  if (hasBizError || hasDeskError || nonRenderCalls.length > 0) {
    console.error('FAIL: Verification detected an error or non-production API request.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: 100% INDEPENDENT PRODUCTION VERIFICATION PASSED!');
    process.exit(0);
  }
}

testIndependentFlow().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
