import { chromium } from 'playwright';

async function testLiveDashboard() {
  console.log('--- STARTING LIVE DASHBOARD VERIFICATION ---');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const failedRequests = [];
  const apiResponses = [];

  page.on('response', resp => {
    if (resp.url().includes('api')) {
      apiResponses.push(`${resp.status()} ${resp.request().method()} ${resp.url()}`);
    }
  });

  page.on('requestfailed', req => {
    if (req.url().includes('api')) {
      failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('error') || msg.text().includes('fetch')) {
      console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  const email = 'bizowner_47473@zoorup-dash.com';
  const password = 'Password123!';
  console.log(`Using existing registered owner: ${email}...`);

  console.log('2. Opening live site in real Chrome: https://zoor-up-9b3a3.web.app/login/business...');
  await page.goto('https://zoor-up-9b3a3.web.app/login/business', { waitUntil: 'networkidle' });

  console.log('3. Filling credentials and clicking Sign In...');
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  console.log('4. Waiting for dashboard navigation and data loading...');
  await page.waitForTimeout(10000);

  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);

  const bodyText = await page.innerText('body');

  console.log('\n--- API Responses ---');
  for (const r of apiResponses) console.log(' ', r);

  console.log('\n--- Failed Requests ---');
  for (const f of failedRequests) console.log(' ', f);

  console.log('\n--- Live Dashboard Page Content ---');
  console.log(bodyText.slice(0, 1200));

  const hasFailedToFetch = bodyText.includes('Failed to fetch') || bodyText.includes('Unable to load business dashboard');
  const hasDashboardData = bodyText.includes('Grand Palace') || bodyText.includes("Today's Sales") || bodyText.includes('Active Store') || bodyText.includes('BUSINESS OWNER');

  console.log('\n----------------------------------------');
  console.log('Failed to fetch present?', hasFailedToFetch);
  console.log('Dashboard data present?', hasDashboardData);
  console.log('----------------------------------------\n');

  await browser.close();

  if (hasFailedToFetch || !hasDashboardData) {
    throw new Error('Verification failed: Dashboard still shows error or missing data.');
  }

  console.log('>>> ALL VERIFICATION PASSED SUCCESSFULLY! <<<');
}

testLiveDashboard().catch(err => {
  console.error(err);
  process.exit(1);
});
