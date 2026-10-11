import { chromium, devices } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext({
    ...devices['iPhone 14']
  });
  const page = await context.newPage();

  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');

  const requests = new Map();

  client.on('Network.requestWillBeSent', params => {
    requests.set(params.requestId, params.request);
    console.log(`[REQ #${params.requestId}] ${params.request.method} ${params.request.url}`);
    if (params.request.url.includes('api')) {
      console.log('  Headers:', JSON.stringify(params.request.headers));
    }
  });

  client.on('Network.responseReceived', params => {
    const req = requests.get(params.requestId);
    console.log(`[RESP #${params.requestId}] ${params.response.status} ${params.response.url} (for ${req?.method || '?'})`);
    if (params.response.url.includes('api')) {
      console.log('  Resp Headers:', JSON.stringify(params.response.headers));
    }
  });

  client.on('Network.loadingFailed', params => {
    const req = requests.get(params.requestId);
    console.log(`[FAILED #${params.requestId}] ${req?.method} ${req?.url} errorText=${params.errorText} corsErrorStatus=${JSON.stringify(params.corsErrorStatus)}`);
  });

  console.log('Navigating directly to login page...');
  await page.goto('https://zoor-up-9b3a3.web.app/login/business', { waitUntil: 'networkidle' });

  const email = 'bizowner_47473@zoorup-dash.com';
  const password = 'Password123!';

  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  console.log('Clicking login button...');
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  console.log('Waiting for dashboard data rendering...');
  await page.waitForSelector('.stat-card, .stat-value', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log('Current URL:', url);
  const text = await page.innerText('body');
  console.log('\n--- LIVE PAGE TEXT ---');
  console.log(text.slice(0, 1500));
  console.log('----------------------\n');

  console.log('Checking for error states...');
  console.log('Has "Unable to load business dashboard":', text.includes('Unable to load business dashboard'));
  console.log('Has "Failed to fetch":', text.includes('Failed to fetch'));
  console.log('Has "Today\'s Sales":', text.includes("Today's Sales"));
  console.log('Has "Total Revenue":', text.includes("Total Revenue") || text.includes("Total Customers"));

  await browser.close();
}

run().catch(console.error);
